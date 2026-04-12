exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const { job_id } = JSON.parse(event.body || "{}");
    if (!job_id) return { statusCode: 400, headers, body: JSON.stringify({ error: "job_id requerido" }) };

    const res = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/carga_jobs?id=eq.${job_id}&select=*`,
      {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    const data = await res.json();
    const job = data?.[0] || null;

    return { statusCode: 200, headers, body: JSON.stringify(job) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
