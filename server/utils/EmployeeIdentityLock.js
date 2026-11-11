const { httpError } = require('./HttpError');

// Connection-scoped lock: acquire before starting any identity-write transaction.
const lockName = "CONCAT('hris:employee-email:', MD5(DATABASE()))";
async function acquireEmployeeIdentityLock(connection) {
  let acquired;
  try {
    [[{ acquired }]] = await connection.execute(
      `SELECT GET_LOCK(${lockName}, 5) AS acquired`
    );
  } catch (error) {
    connection.destroy();
    throw error;
  }
  if (Number(acquired) !== 1)
    throw httpError(
      'Employee identity is being updated. Please try again.',
      409
    );
  return async () => {
    try {
      const [[{ released }]] = await connection.execute(
        `SELECT RELEASE_LOCK(${lockName}) AS released`
      );
      if (Number(released) !== 1)
        throw new Error('Could not release the employee identity lock.');
    } catch (error) {
      // Never return a connection with uncertain lock ownership to the pool.
      connection.destroy();
      throw error;
    }
  };
}

module.exports = { acquireEmployeeIdentityLock };
