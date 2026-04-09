exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { termino } = JSON.parse(event.body || "{}");

    if (!termino || termino.trim() === "") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Término de búsqueda vacío" }),
      };
    }

    // Normalizar teléfono: quitar +34 o 34 al inicio
    let terminoNormalizado = termino.trim();
    if (terminoNormalizado.startsWith("+34")) {
      terminoNormalizado = terminoNormalizado.slice(3);
    } else if (terminoNormalizado.startsWith("34") && terminoNormalizado.length > 9) {
      terminoNormalizado = terminoNormalizado.slice(2);
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Variables de entorno no configuradas" }),
      };
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_clientes_admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ termino: terminoNormalizado }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Supabase error: ${errorText}` }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientes: data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
