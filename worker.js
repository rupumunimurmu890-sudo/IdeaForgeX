export default {
  async fetch(request, env, ctx) {
    return new Response(
      JSON.stringify({
        success: true,
        app: "Universal Helper",
        status: "online"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
