-- Lagning av 0040: den hostade databasen fick 0040_authorities.sql i
-- versionen från 2e7f194 (2026-10-30 18:23), innan f287210 (18:43) lade
-- till 'repaidOre' (återbetald lön under året, agi_repayments) i
-- year_summary(). Det är den enda skillnaden mellan versionerna
-- (git diff 2e7f194..main -- supabase/migrations/0040_authorities.sql),
-- så lagningen är den funktionen, ordagrant ur den granskade 0040, med
-- create or replace. Rättigheterna står kvar (revoke/grant i 0040).
--
-- Där den granskade 0040 redan är lagd (alla nya databaser,
-- supabase/tests/local/run.sh) ändrar filen ingenting. Läggs på efter
-- 0043_product.sql. Provet supabase/tests/0040_authorities.sql ("Årssamman-
-- ställningen för Erik") märker skillnaden: det väntar sig repaidOre.
--
-- Inga andra funktioner rörs: 0041_payroll_repair.sql får fortfarande inte
-- köras igen (0042 och 0043 skriver payroll_inputs_hash).

begin;

-- Årssammanställningen per person: godkända lönebesked i stängda körningar
-- med lönedag under året, och lön som betalats tillbaka för årets månader
-- (year-end.ts yearSummary).
create or replace function public.year_summary(p_org uuid, p_year int) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser årssammanställningen.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'employeeId', employee_id, 'name', name, 'payslips', n, 'cashGrossOre', gross, 'benefitOre', benefit,
             'taxFreeReimbursementOre', taxfree, 'taxOre', tax, 'netOre', net, 'employerContributionOre', contrib,
             'repaidOre', coalesce((select sum(a.amount_ore) from public.agi_repayments a
                                     where a.org_id = p_org and a.employee_id = x.employee_id and left(a.period, 4) = p_year::text), 0)::bigint,
             'firstPayDate', first_pay, 'lastPayDate', last_pay) order by name collate "C", employee_id), '[]'::jsonb)
      from (select p.employee_id, (array_agg(p.document->>'employeeName' order by r.pay_date desc))[1] as name, count(*) as n,
                   sum(p.gross_ore)::bigint as gross, sum((p.document->'totals'->>'benefitOre')::bigint)::bigint as benefit,
                   sum((p.document->'totals'->>'taxFreeReimbursementOre')::bigint)::bigint as taxfree, sum(p.tax_ore)::bigint as tax,
                   sum(p.net_ore)::bigint as net, sum(p.employer_contribution_ore)::bigint as contrib,
                   min(r.pay_date) as first_pay, max(r.pay_date) as last_pay
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and extract(year from r.pay_date) = p_year
             where p.org_id = p_org and p.approved_at is not null
             group by p.employee_id) x);
end;
$$;

commit;
