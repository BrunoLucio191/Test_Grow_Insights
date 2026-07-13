import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { authQueries } from "@/services/queries";
import appCss from "../styles.css?url";
import beGrowLogo from "../assets/beGrowLogo.jpg";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context }) => {
    const authState = await context.queryClient.ensureQueryData(authQueries.user());

    return { authState };
  },
  head: () => ({
    meta: [
      // Configurações Básicas
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BeGrow | Estratégia e Marketing Digital" },
      {
        name: "description",
        content:
          "Estratégias de alto nível em tráfego, copywriting e presença digital. Acelere o crescimento do seu negócio com a BeGrow em São Luís, MA.",
      },
      { name: "author", content: "BeGrow" },
      {
        name: "keywords",
        content:
          "agência de marketing digital, BeGrow, marketing são luís, captação de clientes, posicionamento digital, tráfego pago maranhão",
      },
      { name: "theme-color", content: "#000000" }, // Sugestão: Alterar para a cor principal da paleta da marca

      // Open Graph (Otimização essencial para WhatsApp, Instagram, LinkedIn e Facebook)
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "BeGrow" },
      { property: "og:title", content: "BeGrow | Estratégia e Marketing Digital" },
      {
        property: "og:description",
        content:
          "Transformamos presença digital em um ativo de conversão. Estratégias validadas para escalar os resultados da sua empresa.",
      },
      { property: "og:url", content: "https://med.begrow.com.br/" },
      {
        property: "og:image",
        content: "https://link-para-seu-bucket-ou-site/banner-og-begrow.png",
      },
      { property: "og:image:alt", content: "BeGrow - Resultados em Marketing Digital" },

      // Twitter Cards (Mantido apenas para garantir o layout de imagem grande em apps como Slack/Discord/Telegram)
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "BeGrow | Estratégia e Marketing Digital" },
      {
        name: "twitter:description",
        content:
          "Transformamos presença digital em um ativo de conversão. Estratégias validadas para escalar os resultados da sua empresa.",
      },
      {
        name: "twitter:image",
        content: "https://link-para-seu-bucket-ou-site/banner-og-begrow.png",
      },

      // SEO Local (Garante autoridade para buscas na região)
      { name: "geo.region", content: "BR-MA" },
      { name: "geo.placename", content: "São Luís" },
      { name: "geo.position", content: "-2.5297;-44.3028" },
      { name: "ICBM", content: "-2.5297, -44.3028" },
    ],
    links: [
      // Previne punições do Google por conteúdo duplicado apontando para a URL exata
      { rel: "icon", type: "image/jpeg", href: beGrowLogo },
      { rel: "canonical", href: "https://med.begrow.com.br/" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
