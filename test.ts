import { franc } from "franc";
import { francAll } from "franc-all";

const text = "你食咗飯未？"; // A common sentence in Cantonese (Yue)

// Simple utility to measure execution time
function measure(label, fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${label}:`, result);
  console.log(`${label} took ${(end - start).toFixed(2)}ms\n`);
}

// Run tests
measure("franc", () => franc(text, { minLength: 2 }));
measure("francAll", () => francAll(text, { minLength: 2 }));
