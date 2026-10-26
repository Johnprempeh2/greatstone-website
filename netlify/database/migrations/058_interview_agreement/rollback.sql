-- Rollback for 058_interview_agreement. This deletes every acceptance record of the interview data processing
-- agreement, which the agreement says Greatstone keeps. Export the table first. With the table gone the site
-- refuses every invite (no organisation has accepted), so roll the code back first.
DROP TABLE IF EXISTS interview.agreement_acceptance;
DROP FUNCTION IF EXISTS interview.agreement_acceptance_keep();
