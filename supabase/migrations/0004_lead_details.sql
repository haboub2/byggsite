-- Keep every form field and the moment of consent on the lead itself.
-- details: the form-specific extras (subject, company, current tools) that
--          previously only travelled in the notification email.
-- consent_at: when the visitor ticked the consent box (GDPR record).

alter table leads add column if not exists details jsonb not null default '{}'::jsonb;
alter table leads add column if not exists consent_at timestamptz;
