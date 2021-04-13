// npx mocha -r ts-node/register test/wrapper.spec.ts
require('dotenv').config();
import { JsonRpcProvider } from '@ethersproject/providers';
import { assert, expect } from 'chai';
import { SOR } from '../src';
import {
    SubgraphPoolBase,
    SubGraphPoolsBase,
    SwapInfo,
    SwapTypes,
} from '../src/types';
import { bnum } from '../src/bmath';
import { BigNumber } from '../src/utils/bignumber';

const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA}`
);
const gasPrice = new BigNumber('30000000000');
const maxPools = 4;
const chainId = 1;
const poolsUrl = `https://ipfs.fleek.co/ipns/balancer-team-bucket.storage.fleek.co/balancer-exchange/pools`;
const swapCost = new BigNumber('100000');

describe(`Tests for wrapper class.`, () => {
    it(`Should set constructor variables`, () => {
        const sor = new SOR(provider, gasPrice, maxPools, chainId, poolsUrl);
        assert.equal(provider, sor.provider);
        assert.equal(gasPrice, sor.gasPrice);
        assert.equal(maxPools, sor.maxPools);
        assert.equal(maxPools, sor.maxPools);
        assert.equal(swapCost.toString(), sor.swapCost.toString());
    });

    it(`Should set pools source to URL`, () => {
        const sor = new SOR(provider, gasPrice, maxPools, chainId, poolsUrl);
        assert.isTrue(sor.isUsingPoolsUrl);
        assert.equal(poolsUrl, sor.poolsUrl);
    });

    it(`Should set pools source to pools passed`, () => {
        const poolsFromFile: SubGraphPoolsBase = require('./testData/testPools/subgraphPoolsSmallWithTrade.json');
        const sor = new SOR(
            provider,
            gasPrice,
            maxPools,
            chainId,
            poolsFromFile
        );
        assert.isFalse(sor.isUsingPoolsUrl);
        expect(sor.subgraphPools).to.deep.eq(poolsFromFile);
    });

    it(`Should manually set costOutputToken`, () => {
        const tokenOut = `0xba100000625a3754423978a60c9317c58a424e3d`;
        const manualCost = new BigNumber('700000000000');
        const sor = new SOR(provider, gasPrice, maxPools, chainId, poolsUrl);
        sor.setCostOutputToken(tokenOut, manualCost);
        assert(manualCost, sor.tokenCost[tokenOut]);
    });

    it(`Should return false for fetchPools error`, async () => {
        const failUrl = ``;
        const sor = new SOR(provider, gasPrice, maxPools, chainId, failUrl);
        const fetchSuccess = await sor.fetchPools();
        assert.isFalse(fetchSuccess);
        assert.isFalse(sor.finishedFetchingOnChain);
    });

    it(`fetchPools should fetch with NO scaling`, async () => {
        const poolsFromFile: SubGraphPoolsBase = require('./testData/testPools/subgraphPoolsSmallWithTrade.json');
        const sor = new SOR(
            provider,
            gasPrice,
            maxPools,
            chainId,
            poolsFromFile
        );
        const fetchSuccess = await sor.fetchPools(false);
        assert.isTrue(fetchSuccess);
        assert.isTrue(sor.finishedFetchingOnChain);
        assert.equal(
            poolsFromFile.pools[1].tokens[1].balance,
            sor.onChainBalanceCache.pools[1].tokens[1].balance
        );
    });

    it(`fetchPools with pools passed as input should overwrite pools`, async () => {
        const poolsFromFile: SubGraphPoolsBase = require('./testData/testPools/subgraphPoolsSmallWithTrade.json');
        const sor = new SOR(
            provider,
            gasPrice,
            maxPools,
            chainId,
            JSON.parse(JSON.stringify(poolsFromFile))
        );

        const testPools = require('./testData/filterTestPools.json');
        const newPools: SubGraphPoolsBase = { pools: testPools.stableOnly };

        // Initial cache should be empty
        expect(poolsFromFile).not.deep.equal(newPools);
        expect(newPools).not.deep.equal(sor.onChainBalanceCache);
        expect({ pools: [] }).deep.equal(sor.onChainBalanceCache);

        // First fetch uses data passed as constructor
        let fetchSuccess = await sor.fetchPools(false);
        assert.isTrue(fetchSuccess);
        assert.isTrue(sor.finishedFetchingOnChain);
        expect(poolsFromFile).not.deep.equal(newPools);
        expect(poolsFromFile).deep.equal(sor.onChainBalanceCache);

        // Second fetch uses newPools passed
        fetchSuccess = await sor.fetchPools(false, newPools);
        assert.isTrue(fetchSuccess);
        assert.isTrue(sor.finishedFetchingOnChain);
        expect(poolsFromFile).not.deep.equal(newPools);
        expect(poolsFromFile).not.deep.equal(sor.onChainBalanceCache);
        expect(newPools).deep.equal(sor.onChainBalanceCache);
    });

    it(`Should return no swaps when pools not retrieved.`, async () => {
        const tokenIn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        const tokenOut = '0x6b175474e89094c44da98b954eedeac495271d0f';
        const swapType = SwapTypes.SwapExactIn;
        const swapAmt: BigNumber = bnum(0);
        const sor = new SOR(provider, gasPrice, maxPools, chainId, poolsUrl);
        const swaps: SwapInfo = await sor.getSwaps(
            tokenIn,
            tokenOut,
            swapType,
            swapAmt
        );

        assert.equal(swaps.swapAmount.toString(), '0');
    });

    it(`fetchFilteredPairPools should return false for bad url.`, async () => {
        const tokenIn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        const tokenOut = '0x6b175474e89094c44da98b954eedeac495271d0f';
        const failUrl = ``;

        const sor = new SOR(provider, gasPrice, maxPools, chainId, failUrl);

        const result: boolean = await sor.fetchFilteredPairPools(
            tokenIn,
            tokenOut
        );

        assert.isFalse(result);
        const pairKey = sor.createKey(tokenIn, tokenOut);
        const cachedPools: SubGraphPoolsBase = sor.poolsForPairsCache[pairKey];

        assert.equal(cachedPools.pools.length, 0);
    });

    it(`fetchFilteredPairPools should return true for pools list`, async () => {
        const poolsFromFile: SubGraphPoolsBase = require('./testData/testPools/subgraphPoolsSmallWithTrade.json');
        const tokenIn: string = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        const tokenOut: string = '0x6b175474e89094c44da98b954eedeac495271d0f';

        const sor = new SOR(
            provider,
            gasPrice,
            maxPools,
            chainId,
            poolsFromFile
        );

        const result: boolean = await sor.fetchFilteredPairPools(
            tokenIn,
            tokenOut,
            false
        );

        assert.isTrue(result);

        const pairKey = sor.createKey(tokenIn, tokenOut);
        const cachedPools: SubGraphPoolsBase = sor.poolsForPairsCache[pairKey];
        assert.isAbove(cachedPools.pools.length, 0);
    });

    it(`should have a valid swap`, async () => {
        const poolsFromFile: SubGraphPoolsBase = require('./testData/testPools/subgraphPoolsSmallWithTrade.json');
        const tokenIn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        const tokenOut = '0x6b175474e89094c44da98b954eedeac495271d0f';
        const swapType = SwapTypes.SwapExactIn;
        const swapAmt: BigNumber = bnum('0.1');

        const sor = new SOR(
            provider,
            gasPrice,
            maxPools,
            chainId,
            poolsFromFile
        );

        const result: boolean = await sor.fetchFilteredPairPools(
            tokenIn,
            tokenOut,
            false
        );

        const swapInfo: SwapInfo = await sor.getSwaps(
            tokenIn,
            tokenOut,
            swapType,
            swapAmt
        );

        assert.isAbove(swapInfo.returnAmount.toNumber(), 0);
        assert.isAbove(bnum(swapInfo.swaps[0].amount).toNumber(), 0);
        assert.equal(tokenIn, swapInfo.tokenIn);
        assert.equal(tokenOut, swapInfo.tokenOut);
        assert.equal(
            swapInfo.swapAmount.toString(),
            swapAmt.times(bnum(10 ** 18)).toString(),
            `Wrapper should have same amount as helper.`
        );
    });
});
