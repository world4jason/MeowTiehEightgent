import { renderHook } from "@testing-library/react";
import { useExport } from "../hooks/useExport";
import { ChatMessage } from "../types";

const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "Hello", timestamp: 1000 },
  { id: "2", role: "agent", agentName: "Claude", content: "Hi there", timestamp: 2000 },
];

// jsdom does not implement URL.createObjectURL / revokeObjectURL — stub them
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "";
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

it("exportMd produces correct markdown", () => {
  // Mock DOM APIs — only intercept createElement("a"), pass everything else through
  const mockClick = vi.fn();
  const mockA = { href: "", download: "", click: mockClick };
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, ...args: unknown[]) => {
    if (tag === "a") return mockA as unknown as HTMLAnchorElement;
    return origCreateElement(tag, ...(args as [ElementCreationOptions?]));
  });
  const mockUrl = "blob:http://localhost/fake";
  vi.spyOn(URL, "createObjectURL").mockReturnValue(mockUrl);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  const { result } = renderHook(() => useExport());
  result.current.exportMd("My Session", messages);

  // Verify the anchor was set up correctly
  expect(mockA.download).toBe("My Session.md");
  expect(mockClick).toHaveBeenCalled();
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

  vi.restoreAllMocks();
});

it("exportJson produces correct JSON filename", () => {
  const mockClick = vi.fn();
  const mockA = { href: "", download: "", click: mockClick };
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, ...args: unknown[]) => {
    if (tag === "a") return mockA as unknown as HTMLAnchorElement;
    return origCreateElement(tag, ...(args as [ElementCreationOptions?]));
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  const { result } = renderHook(() => useExport());
  result.current.exportJson("Export Test", messages);

  expect(mockA.download).toBe("Export Test.json");
  expect(mockClick).toHaveBeenCalled();

  vi.restoreAllMocks();
});
