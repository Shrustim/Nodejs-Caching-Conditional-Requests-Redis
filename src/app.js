import express from 'express';
import cookieParser from 'cookie-parser';
import healthRoutes from './routes/v1/health.routes.js';
import userRoutes from "./routes/v1/users.routes.js";
import profileRoutes from "./routes/v1/profile.routes.js";
import adminRoutes from "./routes/v1/admin.routes.js";
import authRoutes from "./routes/v1/auth.routes.js";
import { errorHandler } from './middlerware/errorHandler.js';
import { acceptVersion } from './middlerware/acceptVersion.js';
import { deprecation } from "./middlerware/deprecation.js";
import swaggerUi  from 'swagger-ui-express';
import swaggerSpec from './config/openapi.js';
import { createRateLimiter } from './middlerware/rateLimiter.js';
import {requirePartner,authenticate}  from "./middlerware/authenticate.js";
import repository from './config/store.js';
import { createCache, sendConditional } from './config/cache.js';

export function createApp(redisClient){
const app = express();
const cache = createCache(redisClient);
app.disable("x-powered-by");
//Only enable proxy trust when the actual development proxy configuration is known
if(process.env.TRUST_PROXY === "true"){
 app.set("trust proxy",1);
}
app.use(express.json());
app.use(cookieParser());
//we generate ETags ourswlves
app.disable('etag');
const productKey = (id) => `node07:products:v1:${id}`;

// GET product
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  const { value, source } = await cache.readThrough(
    productKey(id),
    () => repository.getProduct(id)
  );

  res.set('X-Cache', source);

  if (!value) {
    return res.status(404)
      .set('Cache-Control', 'no-store')
      .json({
        error: 'Product not found'
      });
  }

  return sendConditional(
    req,
    res,
    value,
    'private, no-cache'
  );
});

// PATCH product
app.patch('/api/products/:id', async (req, res) => {
  const changes = req.body;

  const isObject =
    changes &&
    typeof changes === 'object' &&
    !Array.isArray(changes);

  const keys = isObject
    ? Object.keys(changes)
    : [];

  const invalid =
    !isObject ||
    !keys.length ||

    keys.some(
      (key) => !['name', 'price'].includes(key)
    ) ||

    ('name' in changes &&
      (
        typeof changes.name !== 'string' ||
        !changes.name.trim()
      )
    ) ||

    ('price' in changes &&
      (
        typeof changes.price !== 'number' ||
        !Number.isFinite(changes.price) ||
        changes.price < 0
      )
    );

  if (invalid) {
    return res.status(400)
      .set('Cache-Control', 'no-store')
      .json({
        error:
          'Provide a valid name and/or nonnegative numeric price'
      });
  }

  const updated = repository.updateProduct(
    req.params.id,
    changes
  );

  if (!updated) {
    return res.status(404)
      .set('Cache-Control', 'no-store')
      .json({
        error: 'Product not found'
      });
  }

  // First update source, then invalidate cache.
  await cache.invalidate(
    productKey(req.params.id)
  );

  return res
    .set('Cache-Control', 'no-store')
    .json(updated);
});

// GET public catalog
app.get('/api/catalog', async (req, res) => {
  const { value, source } = await cache.readThrough(
    'node07:catalog:v1',
    repository.getCatalog
  );

  res.set('X-Cache', source);

  return sendConditional(
    req,
    res,
    value,
    'public, max-age=10, stale-while-revalidate=30'
  );
});

// GET cache metrics
app.get('/api/metrics', (req, res) => {
  return res
    .set('Cache-Control', 'no-store')
    .json(cache.metrics());
});

  //IP-based limit
  const publicLimiter = createRateLimiter({
    redisClient,
    limit:5,
    windowMs:60*1000,
    policyName:"public-endpoint",
    keyGenerator:(req)=>{
      return req.ip;
    }
  })
  //Authenticated user-based limit
  const authenticatedLimiter = createRateLimiter({
    redisClient,
    limit:10,
    windowMs:60*1000,
    policyName:"authenticated-endpoint",
    keyGenerator:(req)=>{
      console.log("---",req.auth)
      return `authenticated-${req.auth.userId}`;
    }
  })
  //Validated API-token-based limit
  const apiTokenLimiter = createRateLimiter({
    redisClient,
    limit:8,
    windowMs:60*1000,
    policyName:"api-token-endpoint",
    keyGenerator:(req)=>{
      return req.tokenHash;
    }
  })
  // Health endpoint remains outside the limiter
  app.get("/healthz", (req, res) => {
    res.status(200).json({
      status: "OK",
    });
  });
  app.get(
    "/api/public",
    publicLimiter,
    (req, res) => {
      res.json({
        message: "Public API response",
      });
    }
  );
  app.get(
    "/api/partner",
    requirePartner,
    apiTokenLimiter,
    (req, res) => {
      res.json({
        message: "Partner API response",
      });
    }
  );




app.use('/api/auth',acceptVersion,(req,res,next)=>{
  if(req.apiVersion.startsWith('1.')){
    return authRoutes(req,res,next)
  }
   return res.status(406).json({
    error: 'Unsupported API version',
  });

})
app.use(
  "/api/v1/auth",
  authRoutes
);

app.use('/api/profile',acceptVersion,deprecation({
  deprecationDate: '2026-10-01T00:00:00Z',
  sunsetDate: '2027-03-31T23:59:59Z',
  documentationUrl: 'https://example.com/docs/api-migration',

}),authenticate,authenticatedLimiter,(req,res,next)=>{
  if(req.apiVersion.startsWith('1.')){
    return profileRoutes(req,res,next)
  }
   return res.status(406).json({
    error: 'Unsupported API version',
  });

})
app.use(
  "/api/v1/profile",deprecation({
  deprecationDate: '2026-10-01T00:00:00Z',
  sunsetDate: '2027-03-31T23:59:59Z',
  documentationUrl: 'https://example.com/docs/api-migration',

}),authenticate,authenticatedLimiter,
  profileRoutes
);

app.use(
  "/api/v1/users/me",authenticate,authenticatedLimiter,
  profileRoutes
);
app.use('/api/admin',acceptVersion,(req,res,next)=>{
  if(req.apiVersion.startsWith('1.')){
    return adminRoutes(req,res,next)
  }
   return res.status(406).json({
    error: 'Unsupported API version',
  });

})
app.use(
  "/api/v1/admin",
  adminRoutes
);

app.use('/health', healthRoutes);
app.use('/api/users',acceptVersion,(req,res,next)=>{
  if(req.apiVersion.startsWith('1.')){
    return userRoutes(req,res,next)
  }
   return res.status(406).json({
    error: 'Unsupported API version',
  });

})

app.use('/api/v1/users',userRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

  return app;
}