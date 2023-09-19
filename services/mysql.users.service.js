"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;

const MYSQLMixin = require('../mixins/mysql.mixins');
/**
 * attachments of addons service
 */
module.exports = {
    name: "mysql.users",
    version: 1,

    mixins: [
        DbService({
            permissions: 'mysql.users'
        }),
        ConfigLoader(['mysql.**']),
        MYSQLMixin
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
            server: {
                type: "string",
                required: true,
                empty: false,
                populate: {
                    action: "v1.mysql.servers.resolve",
                },
            },
            database: {
                type: "string",
                required: true,
                empty: false,
                populate: {
                    action: "v1.mysql.databases.resolve",
                },
            },
            databases: {
                type: "array",
                items: 'string',
                required: true,
                empty: false,
                default: [],
                populate: {
                    action: "v1.mysql.databases.resolve",
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

            ...DbService.FIELDS,// inject dbservice fields
        },

        // default database populates
        defaultPopulates: [],

        // database scopes
        scopes: {
            ...DbService.SCOPE,// inject dbservice scope
        },

        // default database scope
        defaultScopes: [
            ...DbService.DSCOPE,// inject dbservice dscope
        ],

        // default init config settings
        config: {

        }
    },

    /**
     * Actions
     */

    actions: {
        

        //create user and push to database id to user.databases
        getUser: {
            params: {
                database: { type: "string", min: 3, optional: false },
                username: { type: "string", min: 3, optional: false },
                password: { type: "string", min: 3, optional: false },
            },
            permissions: ['mysql.users.create'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                return this.findEntity(null, {
                    query: {
                        ...params
                    }
                })
            }
        },

        //grant user to database and push to database id to user.databases
        grantUser: {
            params: {
                database: { type: "string", min: 3, optional: false },
                id: { type: "string", min: 3, optional: false },
            },
            permissions: ['mysql.users.grant'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                //find user by id
                const user = await this.findEntity(null, {
                    query: {
                        id: params.id
                    }
                });

                if (!user)
                    throw new MoleculerClientError("User not found", 404, "USER_NOT_FOUND");

                const database = await ctx.call('v1.mysql.databases.resolve', {
                    id: params.database
                });

                if (!database)
                    throw new MoleculerClientError("Database not found", 404, "DATABASE_NOT_FOUND");

                const server = await ctx.call('v1.mysql.servers.resolve', {
                    id: database.server
                });

                if (!server)
                    throw new MoleculerClientError("Server not found", 404, "SERVER_NOT_FOUND");

                await this.grantMYSQLUser(server, user, database.name);

                this.logger.info(`granted user to database ${database.name}`, user);

                return this.updateEntity(null, {
                    id: user.id,
                    databases: [...user.databases, database.id]
                });

            }
        },
        //revoke user from database and remove database id from user.databases
        revokeUser: {
            params: {
                database: { type: "string", min: 3, optional: false },
                id: { type: "string", min: 3, optional: false },
            },
            permissions: ['mysql.users.revoke'],
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);
                const user = await this.findEntity(null, {
                    query: {
                        id: params.id
                    }
                });

                if (!user)
                    throw new MoleculerClientError("User not found", 404, "USER_NOT_FOUND");

                const database = await ctx.call('v1.mysql.databases.resolve', {
                    id: params.database
                });

                if (!database)
                    throw new MoleculerClientError("Database not found", 404, "DATABASE_NOT_FOUND");

                const server = await ctx.call('v1.mysql.servers.resolve', { id: database.server });

                if (!server)
                    throw new MoleculerClientError("Server not found", 404, "SERVER_NOT_FOUND");


                await this.revokeMYSQLUser(server, user, database.name);

                this.logger.info(`revoked user from database ${database.name}`, user);

                //remove database from user.databases array
                return this.updateEntity(null, {
                    id: user.id,
                    databases: user.databases.filter(d => d !== database.id)
                });

            }
        }
    },

    /**
     * Events
     */
    events: {
        //find all users that have database in databases 
        //and remove the database from their databases
        //at this point the database is already removed from the database table
        async "mysql.databases.removed"(ctx) {
            const database = ctx.params.data;

            const users = await this.findEntities(null, {
                query: {
                    databases: database.id
                },
                fields: ['id']
            });

            for (const user of users) {
                //revoke user from database
                await this.actions.revokeUser({
                    id: user.id,
                    database: database.id
                }).catch(err => {
                    this.logger.error(err);
                });
            }

        },
        //find all users that have database in databases
        //and grant them access to the database
        async "mysql.users.created"(ctx) {
            const user = ctx.params.data;

            const server = await ctx.call('v1.mysql.servers.resolve', {
                id: user.server
            });
            //create new user on server
            await this.createMYSQLUser(server, user);
            this.logger.info(`created user on server ${server.id}`, user);
        },
        //find all users that have database in databases
        //and revoke their access to the database
        async "mysql.users.removed"(ctx) {
            const user = ctx.params.data;

            const server = await ctx.call('v1.mysql.servers.resolve', {
                id: user.server
            });
            //drop user from server
            await this.dropMYSQLUser(server, user);
            this.logger.info(`dropped user from server ${server.id}`, user);
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