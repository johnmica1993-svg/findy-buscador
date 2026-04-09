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
    console.log("[search] Body recibido:", event.body);
    const { termino } = JSON.parse(event.body || "{}");
    console.log("[search] Término parseado:", termino);

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

    console.log("[search] SUPABASE_URL:", SUPABASE_URL ? "OK" : "UNDEFINED");
    console.log("[search] SERVICE_KEY:", SERVICE_ROLE_KEY ? "OK (" + SERVICE_ROLE_KEY.slice(0, 20) + "...)" : "UNDEFINED");
    console.log("[search] Término normalizado:", terminoNormalizado);

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Variables de entorno no configuradas" }),
      };
    }

    const url = `${SUPABASE_URL}/rest/v1/rpc/buscar_clientes_admin`;
    const fetchBody = JSON.stringify({ termino: terminoNormalizado });
    console.log("[search] Fetch URL:", url);
    console.log("[search] Fetch body:", fetchBody);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: fetchBody,
    });

    console.log("[search] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("[search] Error response body:", errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Supabase ${response.status}: ${errorText}` }),
      };
    }

    const data = await response.json();
    console.log("[search] Resultados:", data?.length, "registros");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientes: data }),
    };
  } catch (err) {
    console.log("[search] CATCH error:", err.message, err.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
