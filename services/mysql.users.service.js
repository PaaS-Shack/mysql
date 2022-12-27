"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const mysql = require('mysql2');
/**
 * attachments of addons service
 */
module.exports = {
    name: "mysql.users",
    version: 1,

    mixins: [
        DbService({}),
        ConfigLoader(['mysql.**'])
    ],

    /**
     * Service dependencies
     */
    dependencies: [

    ],

    /**
     * Service settings
     */
    settings: {
        rest: true,

        fields: {
            database: {
                type: "string",
                required: true,
                empty: false,

                populate: {
                    action: "v1.mysql.databases.resolve",
                    params: {
                        //fields: ["id", "username", "fullName", "avatar"]
                    }
                },
            },

            username: {
                type: "string",
                required: true
            },
            password: {
                type: "string",
                required: true
            },
        },

        scopes: {

        },

        defaultScopes: []
    },

    /**
     * Actions
     */

    actions: {
        create: {
            permissions: ['domains.records.create'],
        },
        list: {
            permissions: ['domains.records.list'],
        },

        find: {
            rest: "GET /find",
            permissions: ['domains.records.find'],
        },

        count: {
            rest: "GET /count",
            permissions: ['domains.records.count'],
        },

        get: {
            needEntity: true,
            permissions: ['domains.records.get']
        },

        update: {
            needEntity: true,
            permissions: ['domains.records.update']
        },

        replace: false,

        remove: {
            needEntity: true,
            permissions: ['domains.records.remove']
        },


        getUser: {
            params: {
                database: { type: "string", min: 3, optional: false },
                username: { type: "string", min: 3, optional: false },
                password: { type: "string", min: 3, optional: false },
            },
            permissions: ['teams.create'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                return this.findEntity(null, {
                    query: {
                        ...params
                    }
                })
            }
        },
    },

    /**
     * Events
     */
    events: {

        async "mysql.users.created"(ctx) {
            const user = ctx.params.data;

            const database = await ctx.call('v1.mysql.databases.resolve', {
                id: user.database,
                populate: ['server']
            })


            var connection = mysql.createConnection({
                host: database.server.hostname,
                port: database.server.port,
                user: 'root',
                password: database.server.password
            });

            connection.connect();

            return new Promise((resolve, reject) => {

                connection.query(`CREATE USER '${user.username}'@'%' IDENTIFIED BY '${user.password}';`, function (error, results, fields) {
                    console.log(error, results, fields)
                    if (error) {
                        reject(error);

                        connection.end();
                    } else {
                        connection.query(`GRANT CREATE VIEW, ALTER, SHOW VIEW, CREATE, INSERT, SELECT, DELETE, TRIGGER, REFERENCES, UPDATE, DROP, INDEX on ${database.name}.* TO '${user.username}'@'%';`, function (error, results, fields) {
                            console.log(error, results, fields)
                            if (error) reject(error);
                            else resolve(user);
                            connection.end();
                        });
                    }
                });
            })
        },
        async "mysql.users.removed"(ctx) {
            const user = ctx.params.data;

            const database = await ctx.call('v1.mysql.databases.resolve', {
                id: user.database,
                populate: ['server'],
                scope: false
            })


            var connection = mysql.createConnection({
                host: database.server.hostname,
                port: database.server.port,
                user: 'root',
                password: database.server.password
            });

            connection.connect();

            return new Promise((resolve, reject) => {

                connection.query(`DROP USER ${user.username}`, function (error, results, fields) {
                    if (error) reject(error);
                    else resolve(results)
                    connection.end();
                });

            })
        },
    },

    /**
     * Methods
     */
    methods: {

    },

    /**
     * Service created lifecycle event handler
     */
    created() { },

    /**
     * Service started lifecycle event handler
     */


    /**
     * Service stopped lifecycle event handler
     */
    stopped() { }
};