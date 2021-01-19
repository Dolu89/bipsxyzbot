import pg from "pg";

let pool;

export const initDb = async () => {
    pool = new pg.Pool();
  await pool.connect();
  const res = await pool.query(
    `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE  table_schema = $1
        AND    table_name   = 'users'
    );`,
    [process.env.PGSCHEMA]
  );

  if (!res.rows[0].exists) {
    console.log("Creating database");
    await pool.query(sql);

    await pool.query(`INSERT INTO update(last_update) VALUES ($1)`, [new Date()])
  }

};

export const query = (text, params) => pool.query(text, params);

const sql = `
CREATE TABLE users
(
    id serial NOT NULL,
    chat_id integer NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE public.update
(
    last_update date NOT NULL
);
`;
