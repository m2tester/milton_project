var spread = SpreadsheetApp.getActiveSpreadsheet();
var categoryResorterA = spread.getSheetByName('分類頁resorter A');
var categoryResorterB = spread.getSheetByName('分類頁resorter B');
var tempStorageA = spread.getSheetByName('resorter_temp_storage_table_A');
var tempStorageB = spread.getSheetByName('resorter_temp_storage_table_B');
var mappingTable = spread.getSheetByName('Mapping Table');
const visibilityMap = {
    1: 'Not Visible Individually',
    2: 'Catalog',
    3: 'Search',
    4: 'Catalog, Search'
};


function sendDataToCloudFunction(params) {
    var url = 'https://asia-east1-czechrepublic-290206.cloudfunctions.net/dev_cf_m2_category_page_sorter';  
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(params)
    };
  
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    var jsonResponse;
    try {
      jsonResponse = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      jsonResponse = null;
    }
    // console.log('Parsed JSON Response:', jsonResponse);
    return jsonResponse;
}
  


function getCategoryById(){
    const categoryId = categoryResorterA.getRange('B4').getValue();


    //檢查categoryId格式
    if(typeof categoryId !== 'number' || isNaN(categoryId)){
        SpreadsheetApp.getUi().alert('錯誤！請檢查 分類頁ID 數值，須為半形數字、不可為空值');
        return;
    }


    const params = {
        action: 'get_category_product_by_id',
        categoryId: categoryId
    };
    const response = sendDataToCloudFunction(params);


    //檢查分類頁是否存在
    if(!(response.categoryName && response.categoryName[0] && response.categoryName[0].value)){
        SpreadsheetApp.getUi().alert('錯誤！查無此分類頁ID，請重新確認');
        return;
    }


    // 寫分類頁名稱
    categoryResorterA.getRange('A4').setValue(response.categoryName[0].value);

    // list product
    categoryResorterA.getRange('A9:J').clearContent();
    const categoryProducts = response.categoryProducts;
    const numRows = categoryProducts.length;
    if (numRows > 0) {
        const data = categoryProducts.map(product => {
            const dates = JSON.parse(product.mrl_sap_expected_start_date || '[]');
            const datesString = dates.join('\n');
            const purchaseQtyList = JSON.parse(product.mrl_sap_purchase_qty || '[]');
            const purchaseQtyFormatted = purchaseQtyList.map(item => {
                return `${item.purchaseQty}(餘${item.remainder})`;
            }).join('\n');
            const visibilityText = visibilityMap[product.visibility] || 'Unknown';
            return [
                product.position,
                product.product_id,
                product.name,
                product.sku,
                product.mrl_sap_cumulative_qty,
                product.mrl_sap_available_qty,
                purchaseQtyFormatted,
                datesString,
                product.mrl_sap_status,
                visibilityText
            ];
        });

        // 將數據寫入 A9 到 J 列
        categoryResorterA.getRange(9, 1, numRows, 10).setValues(data);


        // 將負數的 cumulative_qty 列字體顏色設置為紅色
        const cumulativeQtyRange = categoryResorterA.getRange(9, 6, numRows);
        const cumulativeQtyValues = cumulativeQtyRange.getValues();
        for (let i = 0; i < numRows; i++) {
            const cumulativeQty = parseFloat(cumulativeQtyValues[i][0]);
            if (cumulativeQty < 0) {
                cumulativeQtyRange.getCell(i + 1, 1).setFontColor('red');
            }
            else{
                cumulativeQtyRange.getCell(i + 1, 1).setFontColor('black');
            }
        }

        // 删除最后一个非空行以下的所有行
        const lastDataRow = categoryResorterA.getLastRow();
        const lastRow = categoryResorterA.getMaxRows();
        let deleteRow = lastRow - lastDataRow;
        if(deleteRow > 2){
            categoryResorterA.deleteRows(lastDataRow + 1, deleteRow - 2);
        }
        else{
            categoryResorterA.insertRowsAfter(lastDataRow, 2);
        }

        //寫進storage
        tempStorageA.deleteRows(4, tempStorageA.getMaxRows() - 3);
        tempStorageA.getRange(1 , 1, tempStorageA.getMaxRows(), tempStorageA.getMaxColumns()).clearContent();
        tempStorageA.getRange('A4').setValue(response.categoryName[0].value);
        tempStorageA.getRange('B4').setValue(categoryId);
        tempStorageA.getRange(9, 1, numRows, 10).setValues(data);
        tempStorageA.getRange(1, 1).setValue(new Date().toLocaleString());
    }
    // SpreadsheetApp.getUi().alert('讀取完成');

}




function updateCategoryProductPosition(){
    const categoryId = categoryResorterA.getRange('B4').getValue();
    const data = categoryResorterA.getRange('A9:B' + categoryResorterA.getLastRow()).getValues();
    var updateData = data.map(row => ({
        entity_id: row[1],
        position: row[0]
      }));


    // 檢查是否有任何行的第二項不是數字
    const hasNonNumber = updateData.some(row => typeof row.position !== 'number' || isNaN(row.position));
    if (hasNonNumber) {
        SpreadsheetApp.getUi().alert('錯誤！請檢查 A欄『排序』數值，須為半形數字、不可為空值');
        return;
    }


    var params = {
        action: 'update_category_product_position',
        categoryId: categoryId,
        updateData: updateData
    };
    const response = sendDataToCloudFunction(params);  
    if(!response.success){
        console.log(response.error);
    } 
    SpreadsheetApp.getUi().alert(response.message);
}


function getCategoryByAttributeAndId(){
    deleteTempSheets();
    const categoryId = categoryResorterB.getRange('B4').getValue();

    
    //檢查categoryId格式
    if(typeof categoryId !== 'number' || isNaN(categoryId)){
        SpreadsheetApp.getUi().alert('錯誤！請檢查 分類頁ID 數值，須為半形數字、不可為空值');
        return;
    }


    const params = {
        action: 'get_category_product_by_attribute_and_id',
        categoryId: categoryId,
        attribute: getCategoryDetailsById(categoryId)
    };
    const response = sendDataToCloudFunction(params);

    
    //檢查分類頁是否存在
    if(!(response.categoryName && response.categoryName[0] && response.categoryName[0].value)){
        SpreadsheetApp.getUi().alert('錯誤！查無此分類頁ID，請重新確認');
        return;
    }

    
    categoryResorterB.getRange('B21:B'+ categoryResorterB.getLastRow()).removeCheckboxes(); 


    // 寫分類頁名稱
    categoryResorterB.getRange('A4').setValue(response.categoryName[0].value);

    // list product
    categoryResorterB.getRange('A21:L').clearContent();
    const categoryProducts = response.categoryProducts;
    const numRows = categoryProducts.length;
    if (numRows > 0) {
        const data = categoryProducts.map(product => {
            const dates = JSON.parse(product.mrl_sap_expected_start_date || '[]');
            const datesString = dates.join('\n');
            const purchaseQtyList = JSON.parse(product.mrl_sap_purchase_qty || '[]');
            const purchaseQtyFormatted = purchaseQtyList.map(item => {
                return `${item.purchaseQty}(餘${item.remainder})`;
            }).join('\n');
            const visibilityText = visibilityMap[product.visibility] || 'Unknown';
            const isPositionNumber = !isNaN(parseFloat(product.position)) && isFinite(product.position);
            const price = (parseFloat(product.mrl_discount_price) === 0) ? product.original_price : product.mrl_discount_price;
            return [
                product.position,
                isPositionNumber,
                product.product_id,
                product.name,
                product.sku,
                product.mrl_sap_cumulative_qty,
                product.mrl_sap_available_qty,
                purchaseQtyFormatted,
                datesString,
                product.mrl_sap_status,
                visibilityText,
                price
            ];
        });

        // 將數據寫入 A21 到 L 列
        categoryResorterB.getRange(21, 1, numRows, 12).setValues(data);


        // 將 B 列的值設定為複選框
        const checkboxRange = categoryResorterB.getRange(21, 2, numRows);
        const checkboxRule = SpreadsheetApp.newDataValidation()
            .requireCheckbox()
            .build();
        checkboxRange.setDataValidation(checkboxRule);


        // 將負數的 cumulative_qty 列字體顏色設置為紅色
        const cumulativeQtyRange = categoryResorterB.getRange(21, 7, numRows);
        const cumulativeQtyValues = cumulativeQtyRange.getValues();
        for (let i = 0; i < numRows; i++) {
            const cumulativeQty = parseFloat(cumulativeQtyValues[i][0]);
            if (cumulativeQty < 0) {
                cumulativeQtyRange.getCell(i + 1, 1).setFontColor('red');
            }
            else{
                cumulativeQtyRange.getCell(i + 1, 1).setFontColor('black');
            }
        }

        // 删除最后一个非空行以下的所有行
        const lastDataRow = categoryResorterB.getLastRow();
        const lastRow = categoryResorterB.getMaxRows();
        let deleteRow = lastRow - lastDataRow;
        if(deleteRow > 2){
            categoryResorterB.deleteRows(lastDataRow + 1, deleteRow - 2);
        }
        else{
            categoryResorterB.insertRowsAfter(lastDataRow, 2);
        }


        //寫進storage
        tempStorageB.deleteRows(4, tempStorageB.getMaxRows() - 3);
        tempStorageB.getRange(1 , 1, tempStorageB.getMaxRows(), tempStorageB.getMaxColumns()).clearContent();
        tempStorageB.getRange('A4').setValue(response.categoryName[0].value);
        tempStorageB.getRange('B4').setValue(categoryId);
        tempStorageB.getRange(21, 1, numRows, 12).setValues(data);
        tempStorageB.getRange(1, 1).setValue(new Date().toLocaleString());
    }
    // SpreadsheetApp.getUi().alert('讀取完成');

}



function getCategoryDetailsById(categoryId) {    
    const dataRange = mappingTable.getDataRange();
    const data = dataRange.getValues();
    
    let result = {};
    const reverseVisibilityMap = Object.fromEntries(
        Object.entries(visibilityMap).map(([key, value]) => [value, key])
    );
    for (let i = 2; i < data.length; i++) {
        if (data[i][0] == categoryId) {
            if (data[i][2]) {
                result.mrl_sap_space = data[i][2].split(',').map(status => status.trim());
            }
            
            if (data[i][3]) {
                result.mrl_sap_subcategory = data[i][3].split(',').map(status => status.trim());
            }
            
            if (data[i][4]) {
                result.mrl_sap_status = data[i][4].split(',').map(status => status.trim());
            }
            
            if (data[i][5]) {
                result.visibility = [reverseVisibilityMap[data[i][5].trim()] || 'Unknown'];
            }
            break;
        }
    }
    
    return result;
}



function updateCategoryProductPositionWithBoolean(){
    const categoryId = categoryResorterB.getRange('B4').getValue();
    const data = categoryResorterB.getRange('A21:C' + categoryResorterB.getLastRow()).getValues();
    var updateData = data.filter(row => row[1] === true).map(row => ({
        entity_id: row[2],
        position: row[0]
    }));


    // 檢查是否有任何行的position不是數字
    const hasNonNumber = updateData.some(row => typeof row.position !== 'number' || isNaN(row.position));
    if (hasNonNumber) {
        SpreadsheetApp.getUi().alert('錯誤！請檢查 A欄『排序』數值，須為半形數字、不可為空值');
        return;
    }


    var params = {
        action: 'update_category_product_position',
        categoryId: categoryId,
        updateData: updateData
    };
    const response = sendDataToCloudFunction(params);  
    if(!response.success){
        console.log(response.error);
    } 
    SpreadsheetApp.getUi().alert(response.message);
}




//filter相關
function onFilter(){
    
    //進行暫存    
    const currentSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const categoryResorterBData = categoryResorterB.getRange('A21:L' + categoryResorterB.getLastRow()).getValues();
    const filterCount = getTempSheetCount('filter_temp_');
    const filterTempName = 'filter_temp_' + (filterCount + 1);
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(filterTempName);
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(currentSheet);
    const filterTempTable = spread.getSheetByName(filterTempName);
    
    //temp塞入值
    filterTempTable.getRange(21, 1, categoryResorterBData.length, 12).setValues(categoryResorterBData);

    //temp將空白刪除
    const filterLastDataRow = filterTempTable.getLastRow();
    const filterLastRow = filterTempTable.getMaxRows();
    let filterDeleteRow = filterLastRow - filterLastDataRow;
    if(filterDeleteRow > 2){
        filterTempTable.deleteRows(filterLastDataRow + 1, filterDeleteRow - 2);
    }
    

    var items = categoryResorterB.getRange('A21:L').getDisplayValues();
    var [title] = categoryResorterB.getRange('A20:L20').getValues();
    var priceCondition = {name:'折扣後金額'};
    var minPrice = categoryResorterB.getRange('B9').getValues();
    var maxPrice = categoryResorterB.getRange('D9').getValues();
    if(minPrice != '') priceCondition.minPrice = minPrice;
    if(maxPrice != '') priceCondition.maxPrice = maxPrice;
    var dateCondition = {name:'預計交期起算'};
    var conditionDateTime = categoryResorterB.getRange('B8').getDisplayValues();
    if(conditionDateTime != '') dateCondition.conditionDate = conditionDateTime;
    var params = {
        action: 'filter_data',
        data: {
            items: items,
            title: title,
            condition: [
                dateCondition,
                priceCondition
            ]
        }
    };


    const data = sendDataToCloudFunction(params); 
    updateSheetBData(data);
}


function revertFilter(){
    const filterTempCount = getTempSheetCount('filter_temp_');
    if(filterTempCount > 0){
        const filterTempName = 'filter_temp_' + filterTempCount;
        const filterTempTable = spread.getSheetByName(filterTempName);
        categoryResorterB.getRange('B21:B' + categoryResorterB.getLastRow()).removeCheckboxes(); 
    
        const tempData = filterTempTable.getRange('A21:L' + filterTempTable.getLastRow()).getValues();    
        updateSheetBData(tempData);
        SpreadsheetApp.getActiveSpreadsheet().deleteSheet(filterTempTable);
    }
    else{
        SpreadsheetApp.getUi().alert('無資料可還原');
    }
}


function updateSheetBData(data){
    const numRows = data.length;
    categoryResorterB.getRange('B21:B'+ categoryResorterB.getLastRow()).removeCheckboxes();
    categoryResorterB.getRange('A21:L').clearContent();

    // 將數據寫入 A21 到 L 列
    categoryResorterB.getRange(21, 1, numRows, 12).setValues(data);


    // 將 B 列的值設定為複選框
    const checkboxRange = categoryResorterB.getRange(21, 2, numRows);
    const checkboxRule = SpreadsheetApp.newDataValidation()
        .requireCheckbox()
        .build();
    checkboxRange.setDataValidation(checkboxRule);


    // 將負數的 cumulative_qty 列字體顏色設置為紅色
    const cumulativeQtyRange = categoryResorterB.getRange(21, 7, numRows);
    const cumulativeQtyValues = cumulativeQtyRange.getValues();
    for (let i = 0; i < numRows; i++) {
        const cumulativeQty = parseFloat(cumulativeQtyValues[i][0]);
        if (cumulativeQty < 0) {
            cumulativeQtyRange.getCell(i + 1, 1).setFontColor('red');
        }
        else{
            cumulativeQtyRange.getCell(i + 1, 1).setFontColor('black');
        }
    }

    // 删除最后一个非空行以下的所有行
    const lastDataRow = categoryResorterB.getLastRow();
    const lastRow = categoryResorterB.getMaxRows();
    let deleteRow = lastRow - lastDataRow;
    if(deleteRow > 2){
        categoryResorterB.deleteRows(lastDataRow + 1, deleteRow - 2);
    }
    else{
        categoryResorterB.insertRowsAfter(lastDataRow, 2);
    }
}


//預覽相關
function preview(){
    const previewTableCount = getTempSheetCount('preview_temp');
    if(previewTableCount == 0){
        const categoryResorterBData = categoryResorterB.getRange('A21:L' + categoryResorterB.getLastRow()).getValues();
        const filteredData = categoryResorterBData.filter(item => item[1] === true);
        filteredData.sort((a, b) => {
            if (typeof a[0] !== 'number' && typeof b[0] !== 'number') {
                return 0;  // 如果 a 和 b 都不是數字，保持原有順序
            } else if (typeof a[0] !== 'number') {
                return -1; // 如果 a 不是數字而 b 是數字，a 排在前面
            } else if (typeof b[0] !== 'number') {
                return 1;  // 如果 b 不是數字而 a 是數字，b 排在前面
            } else {
                return a[0] - b[0]; // 如果 a 和 b 都是數字，按照數字大小排序
            }
        });
        updateSheetBData(filteredData);
        const notNum = [];
        filteredData.forEach(item => {
        if (typeof item[0] !== 'number') {
            notNum.push(item[2]);
        }
        });
        if(notNum.length > 0){
            SpreadsheetApp.getUi().alert('注意!\nentity_id: ' + notNum.join(', ') + ' \n的A欄『排序』數值，須為半形數字、不可為空值');
        }



        //進行暫存    
        const currentSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        SpreadsheetApp.getActiveSpreadsheet().insertSheet('preview_temp');
        SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(currentSheet);
        const previewTempTable = spread.getSheetByName('preview_temp');
        
        //temp塞入值
        previewTempTable.getRange(21, 1, categoryResorterBData.length, 12).setValues(categoryResorterBData);

        //temp將空白刪除
        const previewLastDataRow = previewTempTable.getLastRow();
        const previewLastRow = previewTempTable.getMaxRows();
        let previewDeleteRow = previewLastRow - previewLastDataRow;
        if(previewDeleteRow > 2){
            previewTempTable.deleteRows(previewLastDataRow + 1, previewDeleteRow - 2);
        }

    }
    else{
        SpreadsheetApp.getUi().alert('已在預覽修改畫面中');
    }
}


function revertPreview(){
    if(getTempSheetCount('preview_temp') == 0){
        SpreadsheetApp.getUi().alert('無預覽資料');
    }
    else if(getTempSheetCount('preview_temp') == 1){
        const previewTempTable = spread.getSheetByName('preview_temp');
        categoryResorterB.getRange('B21:B' + categoryResorterB.getLastRow()).removeCheckboxes(); 
    
        const tempData = previewTempTable.getRange('A21:L' + previewTempTable.getLastRow()).getValues();    
        updateSheetBData(tempData);
        SpreadsheetApp.getActiveSpreadsheet().deleteSheet(previewTempTable);
    }
}



function saveTempDataToSheetA() {
    const categoryId = tempStorageA.getRange('B4').getValue();
    const data = tempStorageA.getRange('A9:B' + tempStorageA.getLastRow()).getValues();
    var updateData = data.map(row => ({
        entity_id: row[1],
        position: row[0]
      }));

    var params = {
        action: 'update_category_product_position',
        categoryId: categoryId,
        updateData: updateData
    };
    const response = sendDataToCloudFunction(params);  
    if(!response.success){
        console.log(response.error);
    } 

    if(response.message == '更新成功'){
        SpreadsheetApp.getUi().alert('分類頁: '+ tempStorageA.getRange('B4').getValue() +' '+ tempStorageA.getRange('A4').getValue() +'\n已還原\n在 '+ tempStorageA.getRange('A1').getValue() +' 修改前的內容至M2後台');
    }
    else{
        SpreadsheetApp.getUi().alert(response.message);
    }
}


function saveTempDataToSheetB() {
    const categoryId = tempStorageB.getRange('B4').getValue();
    const data = tempStorageB.getRange('A21:C' + tempStorageB.getLastRow()).getValues();
    var updateData = data.filter(row => row[1] === true).map(row => ({
        entity_id: row[2],
        position: row[0]
    }));

    var params = {
        action: 'update_category_product_position',
        categoryId: categoryId,
        updateData: updateData
    };
    const response = sendDataToCloudFunction(params);  
    if(!response.success){
        console.log(response.error);
    } 

    if(response.message == '更新成功'){
        SpreadsheetApp.getUi().alert('分類頁: '+ tempStorageB.getRange('B4').getValue() +' '+ tempStorageB.getRange('A4').getValue() +'\n已還原\n在 '+ tempStorageB.getRange('A1').getValue() +' 修改前的內容至M2後台');
    }
    else{
        SpreadsheetApp.getUi().alert(response.message);
    }
}



function deleteTempSheets() {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var prefix = 'filter_temp_';

    for (var i = sheets.length - 1; i >= 0; i--) {
        var sheet = sheets[i];
        var sheetName = sheet.getName();
        
        // 檢查工作表名稱是否以 "filter_temp_" 開頭
        if (sheetName.startsWith(prefix)) {
            spreadsheet.deleteSheet(sheet);
        }
    }

    if(getTempSheetCount('preview_temp') > 0){
        const previewTempTable = spread.getSheetByName('preview_temp');
        SpreadsheetApp.getActiveSpreadsheet().deleteSheet(previewTempTable);
    }
}


function getTempSheetCount(tempTableName) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();    
    var count = 0;
    for (var i = 0; i < sheets.length; i++) {
        var sheetName = sheets[i].getName();
        if (sheetName.startsWith(tempTableName)) {
            count++;
        }
    }
    
    return count;
}