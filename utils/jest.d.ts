// typings.d.ts

declare namespace jest {
    interface Matchers<R> {
        toBeInRange: (minExpectedAmount: bigint, maxExpectedAmount: bigint) => R;
    }
}
