-- Where a booked shipment is remembered.
--
-- The courier gives back two ids when an order is handed over: one for the
-- order it created, one for the shipment inside it. Both are stored so a
-- second booking attempt -- a double-clicked button, a retried request, a
-- status set twice -- is recognised as already done instead of creating a
-- duplicate parcel that somebody has to spot and cancel.
--
-- courierBookedAt is deliberately not shippedAt. Handing an order over and the
-- parcel actually leaving are different moments, often a day apart, and the
-- customer is told about the second one.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "courierOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "courierShipmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "courierBookedAt" TIMESTAMP(3);

-- Looked up by shipment id every time a tracking event arrives, which for a
-- busy week is the most frequent query in the table.
CREATE INDEX IF NOT EXISTS "Order_courierShipmentId_idx" ON "Order"("courierShipmentId");
