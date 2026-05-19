window.onload = () => {
  window.ui = SwaggerUIBundle({
    url: './daemon.openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: 'list',
    persistAuthorization: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
};
