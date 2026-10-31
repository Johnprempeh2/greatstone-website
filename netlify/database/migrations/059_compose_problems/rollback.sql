-- Rollback for 059_compose_problems. The mapping is regenerable from src/data/compose-problems.mjs.
DROP TABLE IF EXISTS public.compose_problem_services;
DROP TABLE IF EXISTS public.compose_problems;
