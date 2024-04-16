import '@ton/test-utils';
import '../utils/matchers';
import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { ProxyTonMinter, ProxyTonMinterConfig } from '../wrappers/ProxyTonMinter';
import { ProxyTonWallet } from '../wrappers/ProxyTonWallet';
import { ops } from '../utils/constants';
import { findTx } from './helpers';

describe('ProxyTonWallet', () => {
    let blockchain: Blockchain;
    let proxyTonMinter: SandboxContract<ProxyTonMinter>;
    let adminProxyTonWallet: SandboxContract<ProxyTonWallet>;
    let admin: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        const proxyTonWalletCode = await compile('ProxyTonWallet');
        const proxyTonMinterCode = await compile('ProxyTonMinter');
        blockchain = await Blockchain.create();
        admin = await blockchain.treasury('admin');
        user = await blockchain.treasury('user');

        const config: ProxyTonMinterConfig = {
            content: Cell.EMPTY,
            walletCode: proxyTonWalletCode,
        };

        proxyTonMinter = blockchain.openContract(ProxyTonMinter.createFromConfig(config, proxyTonMinterCode));
        await proxyTonMinter.sendDeploy(admin.getSender(), toNano('0.05'));
        await proxyTonMinter.sendMint(admin.getSender(), toNano('100'), { to: admin.address });

        const adminProxyTonWalletAddress = await proxyTonMinter.getWalletAddress(admin.address);
        adminProxyTonWallet = blockchain.openContract(ProxyTonWallet.createFromAddress(adminProxyTonWalletAddress));
    });

    describe('op::transfer from the owner', () => {
        it('should send tx notification when forward_ton exists', async function () {
            const values = {
                jetton_amount: toNano('5'),
                forward_ton_amount: toNano('1'),
                msg_value: toNano('1.5'),
            };

            const res = await adminProxyTonWallet.sendTransfer(admin.getSender(), values.msg_value, {
                jetton_amount: values.jetton_amount,
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: values.forward_ton_amount,
                forward_payload: beginCell().storeUint(1, 32).endCell(),
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.transfer_notification,
                success: true,
                value: values.jetton_amount + values.forward_ton_amount,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.excesses,
                success: true,
            });

            // Exclude fee
            const excessTx = findTx(res.transactions, ops.excesses);
            expect(values.msg_value - excessTx.value!).toBeLessThan(toNano('0.009'));
        });

        it('should be reverted when msg_value is less than forward_ton', async function () {
            const values = {
                jetton_amount: toNano('5'),
                forward_ton_amount: toNano('1'),
                msg_value: toNano('0.5'),
            };

            const res = await adminProxyTonWallet.sendTransfer(admin.getSender(), values.msg_value, {
                jetton_amount: values.jetton_amount,
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: values.forward_ton_amount,
                forward_payload: beginCell().storeUint(1, 32).endCell(),
            });

            expect(res.transactions).toHaveTransaction({
                from: admin.address,
                to: adminProxyTonWallet.address,
                success: false,
            });
        });

        it('should send message when forward_ton not exists', async function () {
            const values = {
                jetton_amount: toNano('2'),
                msg_value: toNano('0.5'),
            };

            const res = await adminProxyTonWallet.sendTransfer(admin.getSender(), values.msg_value, {
                jetton_amount: values.jetton_amount,
                to: user.address,
                response_address: user.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: 0n,
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.excesses,
                success: true,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                success: true,
                value: values.jetton_amount,
            });

            const excessTx = findTx(res.transactions, ops.excesses);
            expect(values.msg_value - excessTx.value!).toBeLessThan(toNano('0.008'));
        });
    });

    describe('op::transfer from the user', () => {
        it('should bounce when forward_ton_amount + jetton_amount is not equal to msg value', async function () {
            const values = {
                jetton_amount: toNano('2'),
                forward_ton_amount: toNano('3'),
            };
            const msgValue = values.jetton_amount + values.forward_ton_amount + 1n;

            const res = await adminProxyTonWallet.sendTransfer(user.getSender(), msgValue, {
                jetton_amount: values.jetton_amount,
                to: admin.address,
                response_address: admin.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: values.forward_ton_amount,
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).not.toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: admin.address,
                op: ops.transfer_notification,
            });
            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: user.address,
                op: ops.excesses,
            });

            const excessTx = findTx(res.transactions, ops.excesses);
            expect(msgValue - excessTx.value!).toBeLessThan(toNano('0.005'));
        });

        it('should send tx notification', async function () {
            const values = {
                jetton_amount: 1n,
                forward_ton_amount: toNano('3'),
            };
            const msgValue = values.jetton_amount + values.forward_ton_amount;

            const res = await adminProxyTonWallet.sendTransfer(user.getSender(), msgValue, {
                jetton_amount: values.jetton_amount,
                to: admin.address,
                response_address: admin.address,
                custom_payload: Cell.EMPTY,
                forward_ton_amount: values.forward_ton_amount,
                forward_payload: Cell.EMPTY,
            });

            expect(res.transactions).toHaveTransaction({
                from: adminProxyTonWallet.address,
                to: admin.address,
                op: ops.transfer_notification,
                value: values.forward_ton_amount,
                success: true,
            });

            const excessTx = findTx(res.transactions, ops.transfer_notification);
            expect(msgValue - excessTx.value!).toBeLessThan(toNano('0.008'));
        });
    });
});
