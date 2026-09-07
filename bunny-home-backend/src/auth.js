const configuredPassword = () => process.env.APP_PASSWORD?.trim();

export function authStatusFromRequest(req) {
  const required = Boolean(configuredPassword());
  const provided = req.get('x-access-password') || '';
  return {
    required,
    authenticated: !required || provided === configuredPassword(),
  };
}

export function authMiddleware(req, res, next) {
  if (!authStatusFromRequest(req).authenticated) {
    return res.status(401).json({
      error: {
        code: 'auth_required',
        message: '需要访问密码',
      },
    });
  }
  return next();
}
