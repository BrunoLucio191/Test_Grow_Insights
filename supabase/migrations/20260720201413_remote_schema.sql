create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

drop policy "authenticated_access_all" on "public"."campaign_groups";

drop policy "clients_insert_all" on "public"."clients";

drop policy "clients_read_all" on "public"."clients";

drop policy "clients_update_all" on "public"."clients";

alter table "public"."meta_cache" drop constraint "meta_cache_client_id_scope_range_from_range_to_key";

drop index if exists "public"."meta_cache_client_id_scope_range_from_range_to_key";


  create table "public"."client_users" (
    "client_id" uuid not null,
    "user_id" uuid not null,
    "user_name" text,
    "cliente" text
      );


alter table "public"."client_users" enable row level security;


  create table "public"."profiles" (
    "user_id" uuid not null,
    "display_name" text default 'Begrow_User'::text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."shared_links" (
    "id" uuid not null default gen_random_uuid(),
    "token" uuid not null,
    "client_id" uuid not null,
    "expires_at" timestamp with time zone not null,
    "snapshot" jsonb not null
      );


alter table "public"."shared_links" enable row level security;


  create table "public"."user_roles" (
    "user_id" uuid not null,
    "role" text default 'user'::text
      );


alter table "public"."user_roles" enable row level security;

alter table "public"."clients" add column "meta_access_token" text;

alter table "public"."meta_cache" add column "user_id" uuid;

CREATE UNIQUE INDEX client_users_pkey ON public.client_users USING btree (client_id, user_id);

CREATE UNIQUE INDEX meta_cache_user_client_scope_range_key ON public.meta_cache USING btree (user_id, client_id, scope, range_from, range_to);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id);

CREATE UNIQUE INDEX shared_links_pkey ON public.shared_links USING btree (id);

CREATE UNIQUE INDEX shared_links_token_key ON public.shared_links USING btree (token);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (user_id);

alter table "public"."client_users" add constraint "client_users_pkey" PRIMARY KEY using index "client_users_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."shared_links" add constraint "shared_links_pkey" PRIMARY KEY using index "shared_links_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."client_users" add constraint "client_users_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE not valid;

alter table "public"."client_users" validate constraint "client_users_client_id_fkey";

alter table "public"."client_users" add constraint "client_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."client_users" validate constraint "client_users_user_id_fkey";

alter table "public"."meta_cache" add constraint "meta_cache_user_client_scope_range_key" UNIQUE using index "meta_cache_user_client_scope_range_key";

alter table "public"."meta_cache" add constraint "meta_cache_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."meta_cache" validate constraint "meta_cache_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."profiles" validate constraint "profiles_user_id_fkey";

alter table "public"."shared_links" add constraint "shared_links_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) not valid;

alter table "public"."shared_links" validate constraint "shared_links_client_id_fkey";

alter table "public"."shared_links" add constraint "shared_links_token_key" UNIQUE using index "shared_links_token_key";

alter table "public"."user_roles" add constraint "check_valid_role" CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text]))) not valid;

alter table "public"."user_roles" validate constraint "check_valid_role";

alter table "public"."user_roles" add constraint "user_roles_role_check" CHECK (((role = 'admin'::text) OR (role = 'user'::text))) not valid;

alter table "public"."user_roles" validate constraint "user_roles_role_check";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_user_client_access(check_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.client_users
    WHERE client_id = check_client_id 
    AND user_id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_expired_shared_links()
 RETURNS void
 LANGUAGE sql
AS $function$
  DELETE FROM public.shared_links
  WHERE expires_at < now();
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  SELECT EXISTS (

    SELECT 1

    FROM public.user_roles

    WHERE user_id = auth.uid() AND role = 'admin'

  );

$function$
;

grant delete on table "public"."client_users" to "anon";

grant insert on table "public"."client_users" to "anon";

grant references on table "public"."client_users" to "anon";

grant select on table "public"."client_users" to "anon";

grant trigger on table "public"."client_users" to "anon";

grant truncate on table "public"."client_users" to "anon";

grant update on table "public"."client_users" to "anon";

grant delete on table "public"."client_users" to "authenticated";

grant insert on table "public"."client_users" to "authenticated";

grant references on table "public"."client_users" to "authenticated";

grant select on table "public"."client_users" to "authenticated";

grant trigger on table "public"."client_users" to "authenticated";

grant truncate on table "public"."client_users" to "authenticated";

grant update on table "public"."client_users" to "authenticated";

grant delete on table "public"."client_users" to "service_role";

grant insert on table "public"."client_users" to "service_role";

grant references on table "public"."client_users" to "service_role";

grant select on table "public"."client_users" to "service_role";

grant trigger on table "public"."client_users" to "service_role";

grant truncate on table "public"."client_users" to "service_role";

grant update on table "public"."client_users" to "service_role";

grant delete on table "public"."clients" to "anon";

grant insert on table "public"."clients" to "anon";

grant select on table "public"."clients" to "anon";

grant update on table "public"."clients" to "anon";

grant delete on table "public"."clients" to "authenticated";

grant insert on table "public"."clients" to "authenticated";

grant select on table "public"."clients" to "authenticated";

grant update on table "public"."clients" to "authenticated";

grant delete on table "public"."clients" to "service_role";

grant insert on table "public"."clients" to "service_role";

grant select on table "public"."clients" to "service_role";

grant update on table "public"."clients" to "service_role";

grant delete on table "public"."meta_cache" to "anon";

grant insert on table "public"."meta_cache" to "anon";

grant select on table "public"."meta_cache" to "anon";

grant update on table "public"."meta_cache" to "anon";

grant delete on table "public"."meta_cache" to "authenticated";

grant insert on table "public"."meta_cache" to "authenticated";

grant select on table "public"."meta_cache" to "authenticated";

grant update on table "public"."meta_cache" to "authenticated";

grant delete on table "public"."meta_cache" to "service_role";

grant insert on table "public"."meta_cache" to "service_role";

grant select on table "public"."meta_cache" to "service_role";

grant update on table "public"."meta_cache" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."shared_links" to "anon";

grant insert on table "public"."shared_links" to "anon";

grant references on table "public"."shared_links" to "anon";

grant select on table "public"."shared_links" to "anon";

grant trigger on table "public"."shared_links" to "anon";

grant truncate on table "public"."shared_links" to "anon";

grant update on table "public"."shared_links" to "anon";

grant delete on table "public"."shared_links" to "authenticated";

grant insert on table "public"."shared_links" to "authenticated";

grant references on table "public"."shared_links" to "authenticated";

grant select on table "public"."shared_links" to "authenticated";

grant trigger on table "public"."shared_links" to "authenticated";

grant truncate on table "public"."shared_links" to "authenticated";

grant update on table "public"."shared_links" to "authenticated";

grant delete on table "public"."shared_links" to "service_role";

grant insert on table "public"."shared_links" to "service_role";

grant references on table "public"."shared_links" to "service_role";

grant select on table "public"."shared_links" to "service_role";

grant trigger on table "public"."shared_links" to "service_role";

grant truncate on table "public"."shared_links" to "service_role";

grant update on table "public"."shared_links" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";


  create policy "Admin All Access - campaign_groups"
  on "public"."campaign_groups"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "RLS_leitura_campanhas_por_vinculo"
  on "public"."campaign_groups"
  as permissive
  for select
  to authenticated
using (public.check_user_client_access(client_id));



  create policy "Admin All Access - client_users"
  on "public"."client_users"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Permitir leitura dos próprios vínculos"
  on "public"."client_users"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Admin All Access - clients"
  on "public"."clients"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Permitir leitura dos próprios clientes"
  on "public"."clients"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.client_users cu
  WHERE ((cu.client_id = clients.id) AND (cu.user_id = auth.uid())))));



  create policy "Admin All Access - meta_cache"
  on "public"."meta_cache"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "RLS_acesso_total_cache_por_vinculo"
  on "public"."meta_cache"
  as permissive
  for all
  to authenticated
using (public.check_user_client_access(client_id))
with check (public.check_user_client_access(client_id));



  create policy "Admin All Access - profiles"
  on "public"."profiles"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Admin All Access - shared_links"
  on "public"."shared_links"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Leitura publica por token"
  on "public"."shared_links"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Usuário cria links dos clientes vinculados"
  on "public"."shared_links"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.client_users cu
  WHERE ((cu.client_id = shared_links.client_id) AND (cu.user_id = auth.uid())))));



  create policy "Admin All Access - user_roles"
  on "public"."user_roles"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Apenas leitura para o dono"
  on "public"."user_roles"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



