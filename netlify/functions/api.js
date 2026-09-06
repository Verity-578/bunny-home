let cachedHandler;

async function getHandler() {
  if (!cachedHandler) {
    const [{ default: serverless }, { createApp }] = await Promise.all([
      import('serverless-http'),
      import('../../bunny-home-backend/src/app.js'),
    ]);
    cachedHandler = serverless(createApp());
  }
  return cachedHandler;
}

exports.handler = async (event, context) => {
  const handler = await getHandler();
  return handler(event, context);
};
