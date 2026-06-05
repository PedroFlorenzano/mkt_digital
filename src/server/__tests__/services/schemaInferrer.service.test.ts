import { schemaInferrerService } from "@server/services/schemaInferrer.service";
import { ValidationError } from "@server/lib/errors";

describe("schemaInferrerService.infer", () => {
  it("infers number type from numeric columns", async () => {
    const csv = Buffer.from("price,quantity\n10.5,3\n20,5\n15.99,1");
    const result = await schemaInferrerService.infer(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("price");
    expect(result[0]!.dataType).toBe("number");
    expect(result[1]!.dataType).toBe("number");
  });

  it("infers boolean type", async () => {
    const csv = Buffer.from("active\ntrue\nfalse\ntrue");
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.dataType).toBe("boolean");
  });

  it("infers date type from YYYY-MM-DD values", async () => {
    const csv = Buffer.from("created\n2025-01-01\n2025-07-15\n2025-12-31");
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.dataType).toBe("date");
  });

  it("infers text type when values are long", async () => {
    const longText = "a".repeat(250);
    const csv = Buffer.from(`description\n${longText}\n${longText}\n${longText}`);
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.dataType).toBe("text");
  });

  it("defaults to string for mixed values", async () => {
    const csv = Buffer.from("name\nAlice\nBob\nCharlie");
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.dataType).toBe("string");
  });

  it("throws ValidationError for empty file", async () => {
    const csv = Buffer.from("");
    await expect(schemaInferrerService.infer(csv)).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for binary file (null bytes)", async () => {
    const csv = Buffer.from("name\0value");
    await expect(schemaInferrerService.infer(csv)).rejects.toThrow(ValidationError);
  });

  it("handles BOM character", async () => {
    const csv = Buffer.from("\uFEFFname,age\nAlice,30");
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.name).toBe("name");
  });

  it("handles quoted fields with commas", async () => {
    const csv = Buffer.from('name,address\nAlice,"123 Main St, Apt 4"\nBob,"456 Oak Ave"');
    const result = await schemaInferrerService.infer(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("name");
    expect(result[1]!.name).toBe("address");
  });

  it("uses max 20 sample rows", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => String(i));
    const csv = Buffer.from(`id\n${rows.join("\n")}`);
    const result = await schemaInferrerService.infer(csv);
    expect(result[0]!.sampleValues.length).toBeLessThanOrEqual(20);
  });
});
