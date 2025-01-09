import { ethers } from 'ethers';
import { extractRealSandwich } from './extractRealSandwich.js'
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '../config/.env' });

const nodeAddress = process.env.NODE_ADDRESS;
const provider = new ethers.JsonRpcProvider(nodeAddress);
const V2SwapEventSignature = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const V3SwapEventSignature = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

const blockFrom = parseInt(process.env.BLOCK_FROM, 10);
const blockTo = parseInt(process.env.BLOCK_TO, 10);
const excelPath = process.env.EXCEL_PATH;


function findConsecutiveSwaps(map) {
    const result = [];
    let keys = Array.from(map.keys());
    let temp = [keys[0]];
    for (let i = 1; i < keys.length; i++) {
        if (keys[i] === keys[i - 1] + 1) {
            temp.push(keys[i]);
        } else {
            if (temp.length >= 3) {
                result.push(temp.join(', '));
            }
            temp = [keys[i]];
        }
    }
    if (temp.length >= 3) {
        result.push(temp.join(', '));
    }
    return result;
}


function findPossibleSandwich(arr) {
    const result = [];
    arr.forEach(map => {
        const values = Array.from(map.values());
        if (map.size === 3) {
            if (checkSameContent(values[0], values[2]) === true &&
                checkIntersection(values[0], values[1]) === true) {
                result.push(map);
            }
        } else {
            const matchingMaps = findMatchingContent(map);
            if (matchingMaps.length > 0) {
                result.push(...matchingMaps);
            }
        }
    });
    return result;
}


function checkSameContent(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    for (let i = 0; i < sorted1.length; i++) {
        if (sorted1[i] !== sorted2[i]) {
            return false;
        }
    }
    return true;
}


function checkIntersection(arr1, arr2) {
    const set = new Set(arr1);
    for (const item of arr2) {
        if (set.has(item)) {
            return true;
        }
    }
    return false;
}


function findMatchingContent(map) {
    const arr = Array.from(map.values());
    const keys = Array.from(map.keys());
    const results = [];

    for (let i = 0; i < arr.length - 2; i++) {
        const first = arr[i];
        for (let j = i + 2; j < arr.length; j++) {
            const last = arr[j];
            if (checkSameContent(first, last)) {
                let valid = true;
                const intermediate = [];
                for (let k = i + 1; k < j; k++) {
                    if (checkIntersection(first, arr[k])) {
                        intermediate.push(arr[k]);
                    } else {
                        valid = false;
                        break;
                    }
                }
                if (valid) {
                    const newMap = new Map();
                    newMap.set(keys[i], first);
                    intermediate.forEach((value, index) => {
                        newMap.set(keys[i + 1 + index], value);
                    });
                    newMap.set(keys[j], last);
                    results.push(newMap);
                }
            }
        }
    }
    return results;
}


function saveToxlsx(arr, path) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
        return;
    }

    const formattedData = arr.map(row => {
        return row.map(cell => {
            if (Array.isArray(cell)) {
                return cell.join(', ');
            }
            if (typeof cell === 'bigint') {
                return cell.toString();
            }
            return cell;
        });
    });

    const headers = [
        "Block number",
        "Sandwich number",
        "Transaction type",
        "TxHash",
        "Associated tokens",
        "Pool Addresses",
        "GasPrice",
        "Transaction Fee",
        "Index"
    ];
    let workbook;
    let worksheet;
    try {
        workbook = xlsx.readFile(path);
        worksheet = workbook.Sheets['Sandwich Data'];
    } catch (error) {
        workbook = xlsx.utils.book_new();
        worksheet = xlsx.utils.aoa_to_sheet([headers]);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Sandwich Data');
    }
    const existingData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    const newData = [...existingData, ...formattedData];
    const newWorksheet = xlsx.utils.aoa_to_sheet(newData);
    workbook.Sheets['Sandwich Data'] = newWorksheet;
    xlsx.writeFile(workbook, path);
}



//main function
async function main() {
    let countSandwich = 0;
    for (let blockCurrent = blockFrom; blockCurrent <= blockTo; blockCurrent++) {
        let sandwichIndex = 0;
        try {
            const block = await provider.getBlock(blockCurrent);
            console.log(`Block ${blockCurrent}:`);
            // Store all transactions contain swap
            const swapTxsMap = new Map();
  
            for (let txHash of block.transactions) {
                const receipt = await provider.getTransactionReceipt(txHash);
                for (let i = 0; i < receipt.logs.length; i++) {
                    let log = receipt.logs[i];
                    if (
                        log?.topics[0] === V2SwapEventSignature ||
                        log?.topics[0] === V3SwapEventSignature
                    ) {
                        if (!swapTxsMap.has(receipt.index)) {
                            swapTxsMap.set(receipt.index, []);
                        }
                        swapTxsMap.get(receipt.index).push(log.address);
                    }
                }
                //add txHash to swapTxsMap
                if (swapTxsMap.has(receipt.index)) {
                    const poolAddresses = swapTxsMap.get(receipt.index);
                    swapTxsMap.set(receipt.index, [poolAddresses, txHash]);
                }
            }
            // find consecutive swaps，push in map
            const consectiveSwaps = findConsecutiveSwaps(swapTxsMap);
            const resultMaps = [];
            for (let item of consectiveSwaps) {
                const map = new Map();
                const numbers = item.split(",").map(num => num.trim());
                //change map’s structure
                for (let n of numbers) {
                    const key = swapTxsMap.get(Number(n))[1]; // Use txHash as key
                    const value = swapTxsMap.get(Number(n))[0]; // Use poolAddresses as value
                    map.set(key, value);
                }
                resultMaps.push(map);
            }
            // Arr(map, map)
            const possibleSandwiches = findPossibleSandwich(resultMaps);
            
        
            //loop possibleSandwiches, find out real sandwich
            for (let i = 0; i < possibleSandwiches.length; i++) {
                const resultArr = await extractRealSandwich(possibleSandwiches[i], blockCurrent);
                if (resultArr && resultArr.length > 0) {
                    sandwichIndex++;  
                    resultArr.forEach(subArray => {
                        if (Array.isArray(subArray)) {
                          subArray.splice(1, 0, sandwichIndex);
                        }
                      });
                }
                saveToxlsx(resultArr,excelPath);
            }
            console.log(`Block ${blockCurrent} found ${sandwichIndex} sandwich attacks.`);
            countSandwich = countSandwich + sandwichIndex;
        } catch (error) {
            console.error(`Error fetching block ${blockCurrent}:`, error);
        }
    }
    
    console.log(`Found ${countSandwich} Sandwich Attacks between block ${blockFrom} and block ${blockTo}`);
    console.log(`Sandwich attack data is saved in the file ${excelPath}`);
}


//execute
main();


