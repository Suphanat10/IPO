import { register } from "./instrumentation";

describe("instrumentation scheduler guard", () => {
  it("keeps the web runtime register hook as a no-op", async () => {
    await expect(register()).resolves.toBeUndefined();
  });
});
