

const { MoleculerClientError } = require("moleculer").Errors;
const mysql = require('mysql2');




module.exports = {
    methods: {

        createMYSQLDatabase(server, database) {
            return this.execQuery(server, `CREATE DATABASE ${database};`)
        },
        dropMYSQLDatabase(server, database) {
            return this.execQuery(server, `DROP DATABASE ${database};`)
        },
        createMYSQLUser(server, user) {
            return this.execQuery(server, `CREATE USER '${user.username}'@'%' IDENTIFIED BY '${user.password}';`)
        },
        grantMYSQLUser(server, user, database) {
            return this.execQuery(server, `GRANT CREATE VIEW, ALTER, SHOW VIEW, CREATE, INSERT, SELECT, DELETE, TRIGGER, REFERENCES, UPDATE, DROP, INDEX on ${database}.* TO '${user.username}'@'%';`)
        },
        revokeMYSQLUser(server, user, database) {
            return this.execQuery(server, `REVOKE CREATE VIEW, ALTER, SHOW VIEW, CREATE, INSERT, SELECT, DELETE, TRIGGER, REFERENCES, UPDATE, DROP, INDEX on ${database}.* FROM '${user.username}'@'%';`)
        },
        dropMYSQLUser(server, user) {
            return this.execQuery(server, `DROP USER ${user.username};`)
        },
        async execQuery(server, query) {
            const connection = await this.createMYSQLConnection(server);
            return new Promise((resolve, reject) => {
                connection.query(query, function (error, results, fields) {
                    if (error) return reject(error);
                    //close the connection
                    connection.end();
                    resolve(results);
                });
            })
        },
        createMYSQLConnection(server) {
            //create connection to mysql server
            const connection = mysql.createConnection({
                host: server.hostname,
                port: server.port,
                user: server.username,
                password: server.password
            });
            //return a promise that resolves to the connection
            return new Promise((resolve, reject) => {
                connection.connect((error) => {
                    if (error) return reject(error);
                    resolve(connection)
                });
            })
        }
    }
};