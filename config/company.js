/**
 * Company / Billing Configuration
 * ──────────────────────────────────────────
 * All values here are returned by the /print API
 * so your frontend bill template can use them.
 * Change them to match your business details.
 */

module.exports = {
  // ── Company Identity ────────────────────────────
  company_name: "KRISHNAM SHIPPING LLP",
  address_line1: "OFFICE NO. 3, KHANDAL BHAWAN, GOKULPURA",
  address_line2: "NEAR ICD CONCOR",
  city: "JAIPUR",
  state: "Rajasthan",
  pincode: "302012",
  msme_no: "UDYAM-RJ-17-0289269",
  gstin: "08AAZFK2783M1ZA",

  // ── Contact ─────────────────────────────────────
  phone: "9828013190",
  email: "satya.khandal19@gmail.com",
  website: "www.krishnamshipping.com",

  // ── Logo URL (for frontend) ─────────────────────
  logo_url: null, // Set your company logo URL here

  // ── Bank Details ────────────────────────────────
  bank_name: "ICICI Bank",
  bank_branch: "Kalwar Road",
  bank_acc_name: "KRISHNAM SHIPPING LLP",
  bank_acc_number: "4181055002770",
  bank_ifsc: "ICIC0004181",
  bank_upi_id: "9828013190.ibz@icici",

  // ── Invoice Defaults ────────────────────────────
  default_invoice_prefix: "KSL/25-26/",

  // ── Terms & Conditions ──────────────────────────
  terms: [
    "Subject to Jaipur Jurisdiction.",
    "Payment accepted by Cheque / NEFT.",
    "Interest @ 18% per annum will be charged on payments made after the due date.",
    "Any discrepancy in this invoice should be notified within 7 days from the date of the invoice.",
  ],
};