-- 0077: e-mail opcional no ticket do CRM.
alter table tickets add column if not exists email text;
