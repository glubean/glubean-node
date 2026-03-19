import { fromCsv } from "../data.js";

export async function loadCsvFromHelper() {
  return fromCsv("./fixtures/helper-cases.csv");
}
