const { getAttributeId } = require('./mysqlService');
const Big = require('big.js');


/**
 * 處理產品數據，包括合併詳細信息、映射屬性代碼到 ID，並轉換數據為插入格式。
 * @param {Array<Object>} products - 產品數據列表。
 * @param {Array<Object>} productDetails - 產品詳細信息列表。
 * @returns {Array<Object>} - 轉換為插入格式的數據列表。
 */
async function processProductData(products,productDetails) {
    let attributeCodes = getAttributeCodes(productDetails);
    let attributeMapping = await getAttributeId(attributeCodes);
    products = mergeProductData(products,productDetails);
    return(formatDataForInsertion(products,attributeMapping));
}





/**
 * 合併產品數據和產品詳細數據
 * @param {Array<Object>} productList - 產品數據數組
 * @param {Array<Object>} detailedProductList - 產品詳細數據數組
 * @returns {Array<Object>} - 合併後的產品詳細數據數組
 */
function mergeProductData(productList, detailedProductList) {
    const detailedProductMap = new Map(
        detailedProductList.map(details => [details.sku, details])
    );
    const combinedProductDetails = productList.map(product => {
        const details = detailedProductMap.get(product.sku) || {};
        return {
            ...product,
            ...details
        };
    });

    return combinedProductDetails;
}






/**
 * 從 productDetails 中提取所有的 attribute_code 鍵值名稱
 * @param {Array<Object>} productDetails - 產品詳細信息數組
 * @returns {Array<string>} - 鍵值名稱的數組
 */
function getAttributeCodes(productDetails) {
    if (productDetails.length === 0) {
        return [];
    }
    const firstItem = productDetails[0];
    return Object.keys(firstItem).filter(key => key !== 'sku');
}



function getSafetyStock(){
    return 2;
}






/**
 * 將產品數據轉換為適合插入資料庫的格式。
 * @param {Array<Object>} products - 產品數據列表。
 * @param {Array<Object>} attributeMapping - 屬性 ID 映射的列表。
 * @returns {Array<Object>} - 轉換後的數據。
 */
async function formatDataForInsertion(products, attributeMapping) {
    const productDataTypeVarchar = [];
    const productDataTypeInt = [];
    const [MRLpreorderAttributeId] = await getAttributeId(['MRL_filters_preorder']);
    const safetyStock = getSafetyStock(); //安全庫存

    products.forEach(product => {
        // 轉換產品的各個屬性
        Object.keys(product).forEach(key => {
            if (key.startsWith('mrl_sap_')) {
                const attribute = attributeMapping.find(attr => attr.attribute_code === key);

                if (attribute) {
                    const attributeId = attribute.attribute_id;
                    const attributeType = attribute.backend_type;

                    let value;

                    if (Array.isArray(product[key])) {
                        // 如果值是對象數組，提取 value 屬性並轉換為純字符串數組
                        if (typeof product[key][0] === 'object' && product[key][0].hasOwnProperty('value')) {
                            value = product[key].map(item => item.value);
                        } else {
                            value = product[key];
                        }

                        // 將純字符串數組轉換為 JSON 字符串
                        value = JSON.stringify(value);
                    } else {
                        value = product[key];
                    }


                    // 處理 Big 類型數據
                    if (value instanceof Big) {
                        value = value.toString();
                    }

                    if(attributeType == 'varchar'){
                        productDataTypeVarchar.push({
                            entity_id: product.entity_id,
                            attribute_id: attributeId,
                            value: value
                        });
                    }
                    else if(attributeType == 'int'){
                        productDataTypeInt.push({
                            entity_id: product.entity_id,
                            attribute_id: attributeId,
                            value: value
                        });
                    }

                    if (key === 'mrl_sap_available_qty') {
                        let preorderValue = parseFloat(value) + safetyStock > 0 ? '134' : '135'; //(待修改)
                        productDataTypeInt.push({
                            entity_id: product.entity_id,
                            attribute_id: MRLpreorderAttributeId.attribute_id,
                            value: preorderValue
                        });
                    }
                }
            }
        });
    });

    return { productDataTypeVarchar , productDataTypeInt };
}

module.exports = { processProductData };
