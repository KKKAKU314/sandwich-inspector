import { ethers } from 'ethers'; 
import dotenv from 'dotenv';
dotenv.config();

const nodeAddress = process.env.NODE_ADDRESS;
const provider = new ethers.JsonRpcProvider(nodeAddress);
const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const tokenCache = {};
const ABI_name = ["function name() view returns (string)"];
const ABI_Decimals = ["function decimals() view returns (uint8)"];


export async function extractRealSandwich(map,blockNumber) {
    const txDetailArr = [];
    const txHashArr = Array.from(map.keys()); 
    const swapPoolArr = Array.from(map.values());

    const frontRunTxReceipt = await provider.getTransactionReceipt(txHashArr[0]);
    const backRunTxReceipt = await provider.getTransactionReceipt(txHashArr[txHashArr.length - 1]);

    const frontRunTxContent = await decodeLogs(frontRunTxReceipt);
    const frontRunSwapPoolArr = swapPoolArr[0];
    const frontRunSwapSequenceMap = getSwapSequenceMap(frontRunSwapPoolArr, frontRunTxContent);
    const frontRunTxFee = ethers.formatUnits(frontRunTxReceipt.gasPrice * frontRunTxReceipt.gasUsed, "ether");
    const frontRunTokens = getAssociatedTokens(frontRunSwapSequenceMap);

    const backRunTxContent = await decodeLogs(backRunTxReceipt);
    const backRunSwapPoolArr = swapPoolArr[swapPoolArr.length - 1];
    const backRunSwapSequenceMap = getSwapSequenceMap(backRunSwapPoolArr, backRunTxContent);
    const backRunTxFee = ethers.formatUnits(backRunTxReceipt.gasPrice * backRunTxReceipt.gasUsed, "ether");
    const backRunTokens = getAssociatedTokens(backRunSwapSequenceMap);
    
    const frontRunDetailArr = [blockNumber,'Front run', txHashArr[0], frontRunTokens, swapPoolArr[0], frontRunTxReceipt.gasPrice, frontRunTxFee, frontRunTxReceipt.index];
    const backRunDetailArr = [blockNumber,'Back run', txHashArr[txHashArr.length - 1], backRunTokens, swapPoolArr[swapPoolArr.length - 1], backRunTxReceipt.gasPrice, backRunTxFee, backRunTxReceipt.index];
    txDetailArr.push(frontRunDetailArr);

    if(frontRunTxReceipt.from === backRunTxReceipt.from){
        let isSandwich = true;
    // loop victim txs
    for (let i = 1; i < txHashArr.length - 1; i++) {
        const victimTxReceipt = await provider.getTransactionReceipt(txHashArr[i]);
        const victimTxContent = await decodeLogs(victimTxReceipt);
        const victimSwapPoolArr = swapPoolArr[i];
        const victimSwapSequenceMap = getSwapSequenceMap(victimSwapPoolArr, victimTxContent);
        const backRunTxFee = ethers.formatUnits(victimTxReceipt.gasPrice * victimTxReceipt.gasUsed, "ether");
        const victimTokens = getAssociatedTokens(victimSwapSequenceMap);

        const victimDetailArr = [blockNumber,`victim${i}`,txHashArr[i], victimTokens, swapPoolArr[i], victimTxReceipt.gasPrice, backRunTxFee, victimTxReceipt.index];
        txDetailArr.push(victimDetailArr);

        if (!SameOrReverseSwapSequence(victimSwapSequenceMap, frontRunSwapSequenceMap) ||
            SameOrReverseSwapSequence(victimSwapSequenceMap, backRunSwapSequenceMap)) {
            isSandwich = false;
            break;
        }
    }
    if (isSandwich) {
        txDetailArr.push(backRunDetailArr);
        // console.log(txDetailArr);

        return txDetailArr;
    }
    }
    return null;
}


function getAssociatedTokens(swapSequenceMap){
    const uniqueTokens = new Set();
    for (const swapPoolArr of swapSequenceMap.values()) {
        for (const swap of swapPoolArr) {
            const tokenName = swap[1]; 
            uniqueTokens.add(tokenName); 
        }
    }
    return Array.from(uniqueTokens); 
}


function getSwapSequenceMap(swapPoolArr, transferContentArr) {
    const resultMap = new Map();
    for (const poolAddress of swapPoolArr) {
        resultMap.set(poolAddress.toLowerCase(), []);
    }
    for(const transferContent of transferContentArr){
        const fromAddress = transferContent[2].toLowerCase();
        const toAddress = transferContent[3].toLowerCase();
        if (resultMap.has(fromAddress) || resultMap.has(toAddress)) {
            if (resultMap.has(fromAddress)) {
                resultMap.get(fromAddress).push(transferContent);
            }
            if (resultMap.has(toAddress)) {
                resultMap.get(toAddress).push(transferContent);
            }
        }
    }
    return resultMap;
}


//compare victim with fornt/back run
function SameOrReverseSwapSequence(victimSwapSequenceMap, frontBackRunSwapSequenceMap) {
    let result = false;
    for (const [victimPool, victimSwapFlow] of victimSwapSequenceMap) {
        if (!frontBackRunSwapSequenceMap.has(victimPool)) continue;
        const frontBackRunSwapFlow =  frontBackRunSwapSequenceMap.get(victimPool);
        if(frontBackRunSwapFlow[0][1] === victimSwapFlow[0][1] &&
           frontBackRunSwapFlow[1][1] === victimSwapFlow[1][1] ){
            //same
            result = true;
        }
        if(frontBackRunSwapFlow[0][1] === victimSwapFlow[1][1] &&
           frontBackRunSwapFlow[1][1] === victimSwapFlow[0][1]){
            //reverse
            result = false;
         }
    }
    return result;
}


async function decodeLogs(receipt) {
    const result = [];
    for (let i = 0; i < receipt.logs.length; i++) {
        const currentLog = receipt.logs[i];
        const tokenName = await getTokenName(currentLog.address);
        // get Transfer Content
        if (currentLog.topics[0] === transferEventSignature) {
            const tokenAmountRaw = ethers.toBigInt(currentLog.data);
            const tokenDecimal = await getTokenDecimal(currentLog.address);
            const topicAddress1 = "0x" + currentLog.topics[1].slice(-40);
            const topicAddress2 = "0x" + currentLog.topics[2].slice(-40);

            result.push([
                ethers.formatUnits(tokenAmountRaw, tokenDecimal),
                tokenName,
                topicAddress1,
                topicAddress2
            ]);
        }
    }
    return result;
}


async function getTokenName(address) {
    if (tokenCache[address]) {
        return tokenCache[address].name;
    }
    try {
        const tokenContract = new ethers.Contract(address, ABI_name, provider);
        const name = await tokenContract.name();
        tokenCache[address] = { name };
        return name;
    } catch (error) {
        return "Unknown Token";
    }
}

async function getTokenDecimal(address) {
    if (tokenCache[address]) {
        return tokenCache[address].decimals;
    }
    try {
        const tokenContract = new ethers.Contract(address, ABI_Decimals, provider);
        const decimals = await tokenContract.decimals();
        tokenCache[address] = { decimals };
        return decimals;
    } catch (error) {
        return 18;
    }
}



