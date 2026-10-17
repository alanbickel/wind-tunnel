import { configure } from "@testing-library/dom";

// `findBy*` and `waitFor` give up after 1 s by default. A full parallel run
// can starve a jsdom test for longer than that, failing it at random. They
// poll, so a passing test still returns as soon as its element appears.
configure({ asyncUtilTimeout: 4_000 });
