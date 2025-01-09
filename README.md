# 🔍 sandwich-inspector
A tool for extracting sandwich attacks from EVM historical data.

## 🖥️ My runtime environment:
OS: Ubuntu 22 (WSL2 on Windows)

RPC_NODE: Local archive node (reth fot EL, lighthouse for CL)

node.js version: 22

ethers version: 6.13


## ⚙️ Set up:
To run the project, first install the required dependencies:

[ethers](https://docs.ethers.org/v6/)
```
npm install ethers
```
[dotenv](https://www.npmjs.com/package/dotenv)
```
npm install dotenv
```
[xlsx](https://www.npmjs.com/package/xlsx)
```
npm install xlsx
```
## 📚 Usage:
### First, update the `.env` file in the `config` folder.

``` .env
# .env file example
BLOCK_FROM = 21551771
BLOCK_TO = 21551771  # >= BLOCK_FROM
EXCEL_PATH = '/mnt/e/research/sandwich_collector/test.xlsx'
```
Set `BLOCK_FROM` and `BLOCK_TO` values to define the range you want to inspect.


Make sure the number in `BLOCK_TO` is greater than or equal to `BLOCK_FROM`.

If you want to export the results to an .xlsx file, set the `EXCEL_PATH` to your desired path.

### Then go to the `src` folder

If you'd like to check the results for a small block range, run
```
node main1.js
```
If you need to analyze sandwich attacks over a larger block range, it’s recommended to execute:
```
node main.js
```


## 🛠In Progress
1. Calculation of the profit of the sandwich attack  
2. Optimize the execution speed

## Maintainers

- [kaku](https://github.com/KKKAKU314)
- [Email](mgs234107@iisec.ac.jp)
