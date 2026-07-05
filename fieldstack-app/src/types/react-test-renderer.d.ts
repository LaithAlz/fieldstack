// react-test-renderer ships no bundled types and @types/react-test-renderer
// isn't installed (kept out per this repo's "no new dependencies" rule for
// this change). It's only ever imported from test files (jest-expo already
// depends on it transitively for its own React Native mocks), so a loose
// ambient `any` module is enough to satisfy `tsc --noEmit` without adding a
// package just for type declarations.
declare module "react-test-renderer";
