import "@testing-library/jest-dom";

// jsdom stubs for DOM methods not implemented (guard for node environment tests)
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
}
