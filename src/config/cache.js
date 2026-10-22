import {createHash } from 'node:crypto';
//Generate Etag from JSON response body
export function makeEtag(jsonBody){
    const hash = createHash('sha256');
    hash.update((jsonBody));
    return `"${hash.digest('hex')}"`;
}
 
//compare ETag with current ETag
export function etagMatched(ifNoneMatch, currentETag){
    if(!ifNoneMatch){
        return false;
    }
    return ifNoneMatch.split(',')
             .some((candidate) => {
                const token = candidate.trim();
                   return (
                        token === '*' ||  token.replace(/^W\//, '') === currentTag
                        );
             })    
}

//Send conditional HTTP response 
export function sendConditional(req, res, value, cacheControl){
    const body = JSON.stringify(value);
    const etag = makeEtag(body);
    res.set('ETag',etag);
    res.set('Cache-Control',cacheControl);
    const isReadRequest = req.method === 'GET' || req.method === 'HEAD';
    if(isReadRequest & etagMatched(req.get('If-None-Match'),etag)){
        res.status(304).end();
    }
    return res.status(200).type('json').send(body);
}

//create resulable cache service
export function createCache(redis,{ttlSeconds=60,logger = console}={}){
    const stats = {
        hits:0,
        misses:0,
        bypasses:0,
        errors:0
    }
    //retry failed invalidations within this process.
    const pendingInvalidations = new Set();
    function recordError(error){
        stats.errors +=1;
        logger.warn?.('Redis cache unavaible', error.message)
    }
    //Redis cache-aside read
    async function readThrough(key,loader){
        try{
            if(!redis.isReady){
            throw new Error('Redis not ready')
            }
            //retry invalidation before reading
            if(pendingInvalidations.has(key)){
                await redis.del(key);
                pendingInvalidations.delete(key)
            }
            const cached = await redis.get(key);
            if(cached !== null){
                const value = JSON.parse(cached);
                stats.hits +=1
                return {
                    value,source:'HIT'
                }
            }
       
        }catch(error){
           recordError(error)
           stats.bypasses +=1
           return {value: await loader(),
            source:'BYPASS'
           }
        }

        //Redis miss
        stats.misses +1;
        const value = await loader();
        if(value !== null &  value !== undefined){
             try {
                    await redis.set(
                    key,
                    JSON.stringify(value),
                    { EX: ttlSeconds }
                    );
                } catch (error) {
                    recordError(error);
                }
        }
        return {
            value, source: 'MISS'
        }
    }
    //Invalidate cached data
    async function invalidate(key){
        pendingInvalidations.add(key);
        try{
            if(!redis.isReady){
                throw new Error("Redis not ready")
            }
            await redis.del(key)
            pendingInvalidations.delete(key);
            return true;
        }catch(error){
            recordError(error);
            return false
        }
    }
    function metrics(){
        const checked = stats.hits + stats.misses;
        const hitRatePercent = checked? Number(((stats.hits / checked) * 100).toFixed(1)) : 0;
        return {...stats,hitRatePercent,pendingInvalidations:pendingInvalidations.size}
    }
    return {readThrough,invalidate,metrics}
} 
