
// Mocking the deduplication logic from background.js
const sessionSeenNames = new Map();

function shouldSkip(finalName, r) {
    const seenEntry = sessionSeenNames.get(finalName);
    const hasDetails = !!(r.address && r.address !== '-' && r.phone);
    
    // New logic: [v65.9] Improved Deduplication: Only skip if WE ALREADY HAVE details.
    if (seenEntry && seenEntry.hasDetails) {
        return true;
    }
    return false;
}

// Test Data
const r1 = { name: "Business A", address: "-", phone: "" }; // No details
const r2 = { name: "Business A", address: "123 Main St", phone: "555-1234" }; // Has details
const r3 = { name: "Business B", address: "456 Oak Ave", phone: "555-5678" }; // Has details

console.log("--- Initial State ---");
console.log("Empty map, checking Business A (no details):", shouldSkip("Business A", r1) ? "SKIP" : "KEEP");
sessionSeenNames.set("Business A", { hasDetails: !!(r1.address && r1.address !== '-' && r1.phone) });

console.log("\n--- After first discovery (Business A, no details) ---");
console.log("Map state for Business A:", sessionSeenNames.get("Business A"));
console.log("Checking Business A again (no details):", shouldSkip("Business A", r1) ? "SKIP" : "KEEP");
console.log("Checking Business A again (WITH details):", shouldSkip("Business A", r2) ? "SKIP" : "KEEP");

console.log("\n--- Simulating enrichment success for Business A ---");
sessionSeenNames.set("Business A", { hasDetails: true });
console.log("Map state for Business A:", sessionSeenNames.get("Business A"));
console.log("Checking Business A again (no details):", shouldSkip("Business A", r1) ? "SKIP" : "KEEP");

console.log("\n--- Checking Business B (has details) ---");
console.log("Checking Business B (has details):", shouldSkip("Business B", r3) ? "SKIP" : "KEEP");
sessionSeenNames.set("Business B", { hasDetails: true });
console.log("Checking Business B again:", shouldSkip("Business B", r3) ? "SKIP" : "KEEP");

console.log("\n--- Final Verification ---");
if (shouldSkip("Business A", r1) === true && sessionSeenNames.get("Business A").hasDetails === true) {
    console.log("✅ Verification PASSED: Logic ensures re-processing until details are found.");
} else {
    console.log("❌ Verification FAILED.");
}
