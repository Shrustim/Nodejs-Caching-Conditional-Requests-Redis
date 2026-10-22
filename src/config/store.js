const initialProducts = [
    {
        id:'1',
        name:"product 1",
        price:100
    },
    {
        id:'2',
        name:"product 2",
        price:200
    }
]
let products = new Map(
  initialProducts.map((product) => [
    product.id,
    { ...product }
  ])
);

export function getProduct(id){
    const product = products.get(id)
    console.log("---------id",id, 'products',product)
    return product ? {...product} : null;    
}
 export function updateProduct(id, updatedProduct){
    const product = getProduct(id)
    if(product){
        products.set(id, {...product, ...updatedProduct});
        return {...product, ...updatedProduct};
    }else{
        throw new Error(`Product with id ${id} does not exist.`);
    }
}

export function getCatalog() {
        return {categories:['Electronics','Books']}
}

export function resetStoreForTesting(){
      products = new Map(
    initialProducts.map((product) => [
      product.id,
      { ...product }
    ])
  );

}


export default {
    getProduct,
    updateProduct,
    getCatalog,
    resetStoreForTesting
}