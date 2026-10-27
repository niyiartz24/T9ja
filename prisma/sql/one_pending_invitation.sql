CREATE UNIQUE INDEX "OrganizerInvitation_one_pending_per_email"
  ON "OrganizerInvitation" ("email") WHERE "status" = 'PENDING';
