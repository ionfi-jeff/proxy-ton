# Proxy TON Contract

## Introduction

The Proxy TON Contract enables a unified message interface for sending and receiving TON coins, similar to the handling of jettons. This proxy contract simplifies transactions on any smart contract that receive TON coins by eliminating the need for receiver contracts to implement additional interfaces to manage TON coins. This system is analogous to the wrapped ether gateway on Ethereum, facilitating ETH transactions as if they were ERC20 tokens. The Proxy TON is particularly useful in user-interactive environments such as marketplaces and decentralized exchanges (DEXs). However, it is not designed for direct user-to-user interactions because it does not implement internal transfer between jetton wallet to jetton wallet.

## Message Flow

### Scenario: Marketplace Transactions

Let's say there is a marketplace, which receives TON Coin or Jetton and sends NFTs to users. Conversely, it can also receive an NFT from a user and send the user TON Coin or jetton for its value. In the case of Jetton payments from Alice to the marketplace, the message flow is as follows:

#### Jetton Payments

1. Alice sends a transfer message to her Jetton wallet.
2. Her Jetton wallet initiates an `internal_transfer` to the marketplace's Jetton wallet.
3. The marketplace's Jetton wallet sends a `transfer_notification` to the marketplace contract.
4. Upon receiving this notification, the marketplace contract processes the necessary transaction logic.

![Jetton Payments from Alice to marketplace](images/1.png 'Jetton Payments from Alice to marketplace')

Conversely, if the marketplace needs to send NFTs to a user and transfer Jetton in return, the message flow is as follows:

1. The marketplace sends a transfer message to its own Jetton wallet.
2. The marketplace's Jetton wallet sends an `internal_transfer` to the user's Jetton wallet.
3. The user's Jetton wallet sends a `transfer_notification` to the user with TON coin.

![Jetton Payments from marketplace to user](images/2.png 'Jetton Payments from marketplace to user')

#### TON Coin Payments with Proxy TON

Using the Proxy TON, the message flow is streamlined:

1. Alice sends a transfer message to the marketplace's Proxy TON wallet.
2. The Proxy TON wallet sends a `transfer_notification` to the marketplace contract.
3. The marketplace contract executes the corresponding transaction logic.

![TON Coin Payments from Alice to marketplace](images/3.png 'TON Coin Payments from Alice to marketplace')

Conversely, if the marketplace needs to send NFTs to a user and transfer TON Coin in return, the message flow is as follows:

1. The marketplace sends a transfer message to its Proxy TON wallet.
2. The Proxy TON wallet sends a `transfer_notification` to the user.

This integration allows TON Coin to be handled with the same interface as Jetton, simplifying contract interactions.

![TON Coin Payments from marketplace to user](images/4.png 'TON Coin Payments from marketplace to user')

## Pre-requisites

Before using the Proxy TON, the Receiver contract's Proxy TON wallet must be deployed:

-   The Proxy TON Wallet is set up through the Proxy TON Minter.
-   Unlike typical jetton transactions which utilize `internal_transfer` for wallet setup, the Proxy TON requires deployment via the Proxy TON Minter due to its distinct handling of TON Coins.

![Deploy Proxy TON Wallet](images/5.png 'Deploy Proxy TON Wallet')

## Message Schema

The messages handled by the Proxy TON Wallet contract, `transfer` and `transfer_notification`, follow the same schema as those in the Jetton Standard:

```c
transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
           response_destination:MsgAddress custom_payload:(Maybe ^Cell)
           forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
           = InternalMsgBody;

transfer_notification query_id:uint64 amount:(VarUInteger 16)
           sender:MsgAddress forward_payload:(Either Cell ^Cell)
           = InternalMsgBody;
```

## Value Flow

When sending a transfer message, the user must ensure the `msg_value` equals `forward_ton_amount + jetton_amount`. The Proxy TON Wallet makes `transfer_notification` message carry the `forward_ton_amount` in forwarding message, reserving the `jetton_amount` in the its wallet. If the amounts do not match, the wallet returns the received TON Coins to the user.

![Value Flow](images/6.png 'Value Flow')

-   **Gas consumption estimated at 0.007 TON.**

```c
if (forward_ton_amount + jetton_amount != msg_value) {
      if (msg_value > 0) {
        var msg = begin_cell()
        .store_msg_flag(msg_flag::non_bounceable)
        .store_slice(sender_address)
        .store_coins(msg_value)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_op(op::excesses)
        .store_query_id(query_id);

        send_raw_message(msg.end_cell(), 2);
      }

      return ();
    }

    var msg_body = begin_cell()
          .store_op(op::transfer_notification)
          .store_query_id(query_id)
          .store_coins(jetton_amount)
          .store_slice(sender_address)
          .store_slice(either_forward_payload)
          .end_cell();

    var msg = begin_cell()
        .store_msg_flag(msg_flag::non_bounceable)
        .store_slice(to_owner_address)
        .store_coins(forward_ton_amount)
        .store_uint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_ref(msg_body);

    send_raw_message(msg.end_cell(), PAY_FEES_SEPARATELY);
```

On the other hand, when the marketplace sends a transfer message to the Proxy TON Wallet, the marketplace contract directs its Proxy TON Wallet on how much TON should be transferred in the jetton_amount, combining the original TON amount and reserves. The message behavior adapts based on whether there is a forward TON amount, akin to typical jetton operations. If there's forward_payload, it will send `transfer_notification`, otherwise, it will just send TON coins to the user.
![Value Flow](images/7.png 'Value Flow')

-   **Gas consumption estimated at 0.008 TON.**

```c
  if (equal_slice_bits(owner_address, sender_address)) {
    var msg_body = null();

    if(forward_ton_amount) {
      throw_unless(error::not_enough_tons, msg_value > fwd_fee + forward_ton_amount + fee::gas_consumption);

      msg_body = begin_cell()
          .store_op(op::transfer_notification)
          .store_query_id(query_id)
          .store_coins(jetton_amount)
          .store_slice(sender_address)
          .store_slice(forward_payload)
          .end_cell();

      var msg = begin_cell()
              .store_msg_flag(msg_flag::non_bounceable)
              .store_slice(to_owner_address)
              .store_coins(jetton_amount + forward_ton_amount)
              .store_uint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
              .store_ref(msg_body);

      send_raw_message(msg.end_cell(), 1);

    } else {
      var msg = begin_cell()
              .store_msg_flag(msg_flag::non_bounceable)
              .store_slice(to_owner_address)
              .store_coins(jetton_amount)
              .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1);
      send_raw_message(msg.end_cell(), 1);
    }

    if ((response_address.preload_uint(2) != 0)) {
      var msg = begin_cell()
      .store_msg_flag(msg_flag::non_bounceable)
      .store_slice(response_address)
      .store_coins(0)
      .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
      .store_op(op::excesses)
      .store_query_id(query_id);
      send_raw_message(msg.end_cell(), 64);
    }

  }
```

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
