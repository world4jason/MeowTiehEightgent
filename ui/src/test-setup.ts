import "@testing-library/jest-dom";

// jsdom stubs for DOM methods not implemented
Element.prototype.scrollIntoView = () => {};
