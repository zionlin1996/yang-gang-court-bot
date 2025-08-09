

async function setup({ app, bot }, options) {
  const DEV_MODE = options.mode !== 'production'
  if (DEV_MODE) {
    // In development mode, just start the bot with polling
    console.log(`Bot running in DEVELOPMENT mode with polling`);
    console.log(`Bot is listening for messages on localhost`);
  } else {
    const port = process.env.PORT || 3000;
    // Health check endpoint
    app.get('/', (req, res) => res.send('ok'));
    // Webhook endpoint for Render.com (only used in production)
    app.post('/webhook', (req, res) => {
      try {
        console.log('Received webhook update:', JSON.stringify(req.body, null, 2));
        bot.processUpdate(req.body);  
        res.sendStatus(200);
      } catch (error) {
        console.error('Error handling webhook update:', error);
        res.sendStatus(500);
      }
    });

    // Set webhook for render.com (production only)
    // render.com provides the service URL via RENDER_EXTERNAL_URL
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
      const webhookUrl = `${renderUrl}/webhook`;
      bot.setWebHook(webhookUrl).then(() => {
        console.log(`Webhook set to: ${webhookUrl}`);
      }).catch((error) => {
        console.error('Failed to set webhook:', error);
      });
    } else {
      console.warn('RENDER_EXTERNAL_URL not found. Webhook not set. Bot will not receive updates in production.');
    }

    // In production mode, start the server and set webhook
    app.listen(port, () => console.log(`Bot server running on port ${port}`));
  }
}

module.exports = setup
