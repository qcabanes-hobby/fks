-- Null out duplicate endpoints before adding the unique index. Keeps the row
-- with the most recent lastSeenAt as the live one; older duplicates are
-- treated as orphaned and have their push fields cleared.
UPDATE "Device" d
SET "pushEndpoint" = NULL,
    "pushP256dh" = NULL,
    "pushAuth" = NULL
FROM (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "pushEndpoint" ORDER BY "lastSeenAt" DESC, id DESC) AS rn
    FROM "Device"
    WHERE "pushEndpoint" IS NOT NULL
  ) ranked
  WHERE rn > 1
) dupes
WHERE d.id = dupes.id;

-- CreateIndex
CREATE UNIQUE INDEX "Device_pushEndpoint_key" ON "Device"("pushEndpoint");
