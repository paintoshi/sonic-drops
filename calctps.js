const fetch = require('node-fetch')

const RPC_URL = 'https://rpc.blaze.soniclabs.com'
const BATCH_SIZE = 10

// Convert wei (as hex) to Ether
function weiToEther(weiHex) {
  const wei = BigInt(weiHex)
  return Number(wei) / 1e18
}

async function fetchBlocksBatch(blockNumbers) {
  const payload = blockNumbers.map((blockNum, idx) => ({
    jsonrpc: '2.0',
    id: idx + 1,
    method: 'eth_getBlockByNumber',
    params: ['0x' + blockNum.toString(16), true]
  }))

  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const data = await response.json()
  return data.map(r => r.result).filter(Boolean)
}

async function analyzeBlocks(startBlock, endBlock) {
  let totalTx = 0
  let totalGasUsed = 0
  let startTimestamp = null
  let endTimestamp = null

  const totalBlocks = endBlock - startBlock + 1
  for (let i = 0; i < totalBlocks; i += BATCH_SIZE) {
    const batchStart = startBlock + i
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock)
    const blockNums = []
    for (let b = batchStart; b <= batchEnd; b++) {
      blockNums.push(b)
    }

    const blocks = await fetchBlocksBatch(blockNums)

    for (const block of blocks) {
      const blockNum = parseInt(block.number, 16)
      const timestamp = parseInt(block.timestamp, 16)
      const txs = block.transactions || []

      if (blockNum === startBlock) startTimestamp = timestamp
      if (blockNum === endBlock) endTimestamp = timestamp

      totalTx += txs.length

      for (const tx of txs) {
        const gasUsed = BigInt(tx.gas) // this is gas limit, not used
        const gasPrice = BigInt(tx.gasPrice)
        const gasCost = gasUsed * gasPrice
        totalGasUsed += Number(gasCost) / 1e18
      }
    }
  }

  const timeDiff = endTimestamp - startTimestamp
  const tps = timeDiff > 0 ? totalTx / timeDiff : 0

  return {
    totalTransactions: totalTx,
    totalGasSpent: totalGasUsed,
    timeDiffSeconds: timeDiff,
    tps
  }
}

// ---- CLI handling ----
const args = process.argv.slice(2)
if (args.length !== 2) {
  console.error('Usage: node calctps.js <startBlock> <endBlock>')
  process.exit(1)
}

const startBlock = parseInt(args[0])
const endBlock = parseInt(args[1])

if (isNaN(startBlock) || isNaN(endBlock) || startBlock > endBlock) {
  console.error('Invalid block numbers')
  process.exit(1)
}

analyzeBlocks(startBlock, endBlock).then(result => {
  console.log(`From block ${startBlock} to ${endBlock}:`)
  console.log(`Total blocks ${endBlock - startBlock}`)
  console.log(`Total TXs: ${result.totalTransactions}`)
  console.log(`Total gas spent: ${result.totalGasSpent.toFixed(4)} S`)
  console.log(`Time diff: ${result.timeDiffSeconds} sec`)
  console.log(`TPS: ${result.tps.toFixed(2)}`)
}).catch(err => {
  console.error('Error analyzing blocks:', err)
})