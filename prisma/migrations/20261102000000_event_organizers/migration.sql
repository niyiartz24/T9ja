-- Organizers added to an event by its owner, by another organizer on it, or by the Super Admin.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS "EventOrganizer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventOrganizer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventOrganizer_eventId_userId_key" ON "EventOrganizer"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "EventOrganizer_userId_idx" ON "EventOrganizer"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrganizer_eventId_fkey' AND conrelid = '"EventOrganizer"'::regclass) THEN
    ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrganizer_userId_fkey' AND conrelid = '"EventOrganizer"'::regclass) THEN
    ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrganizer_addedById_fkey' AND conrelid = '"EventOrganizer"'::regclass) THEN
    ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
