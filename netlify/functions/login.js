exports.handler = async (event, context) => {
  const { username, password } = JSON.parse(event.body || '{}');

  if (username === 'admin' && password === 'adminpassword') {
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, token: 'abc123' })
    };
  }

  return {
    statusCode: 401,
    body: JSON.stringify({ success: false, message: 'Unauthorized' })
  };
};
