"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;


const MYSQLMixin = require('../mixins/mysql.mixins');

/**
 * mysql databases service for managing mysql databases
 * 
 */
module.exports = {
	name: "mysql.databases",
	version: 1,

	mixins: [
		DbService({}),
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
				}
			},
			name: {
				type: "string",
				min: 3,
				required: true
			},
			connectionLimit: {
				type: "number",
				default: 10
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
			permissions: ['mysql.databases.create'],
		},
		list: {
			permissions: ['mysql.databases.list'],
		},

		find: {
			rest: "GET /find",
			permissions: ['mysql.databases.find'],
		},

		count: {
			rest: "GET /count",
			permissions: ['mysql.databases.count'],
		},

		get: {
			needEntity: true,
			permissions: ['mysql.databases.get']
		},

		update: {
			needEntity: true,
			permissions: ['mysql.databases.update']
		},

		replace: false,

		remove: {
			needEntity: true,
			permissions: ['mysql.databases.remove']
		},
		//get database stats from mysql
		databaseStats: {
			rest: "GET /:id/stats",
			permissions: ['mysql.databases.stats'],
			params: {
				id: { type: "string" }
			},
			async handler(ctx) {
				const database = await ctx.call('v1.mysql.databases.resolve', { id: ctx.params.id });
				if (!database)
					throw new MoleculerClientError('Database not found', 404, 'DATABASE_NOT_FOUND', { id: ctx.params.id });
				const server = await ctx.call('v1.mysql.servers.resolve', { id: database.server });
				if (!server)
					throw new MoleculerClientError('Server not found', 404, 'SERVER_NOT_FOUND', { id: database.server });
				return this.execQuery(server, `SELECT table_schema "database", SUM(data_length + index_length) / 1024 / 1024 "size" FROM information_schema.TABLES WHERE table_schema = '${database.name}' GROUP BY table_schema;`);
			},
		},
		//get database tables from mysql
		databaseTables: {
			rest: "GET /:id/tables",
			permissions: ['mysql.databases.tables'],
			params: {
				id: { type: "string" }
			},
			async handler(ctx) {
				const database = await ctx.call('v1.mysql.databases.resolve', { id: ctx.params.id });
				if (!database)
					throw new MoleculerClientError('Database not found', 404, 'DATABASE_NOT_FOUND', { id: ctx.params.id });
				const server = await ctx.call('v1.mysql.servers.resolve', { id: database.server });
				if (!server)
					throw new MoleculerClientError('Server not found', 404, 'SERVER_NOT_FOUND', { id: database.server });
				return this.execQuery(server, `SELECT table_name FROM information_schema.tables WHERE table_schema = '${database.name}';`);
			}
		},
		//get connection count from mysql for database
		databaseConnections: {
			rest: "GET /:id/connections",
			permissions: ['mysql.databases.connections'],
			params: {
				id: { type: "string" }
			},
			async handler(ctx) {
				const database = await ctx.call('v1.mysql.databases.resolve', { id: ctx.params.id });
				if (!database)
					throw new MoleculerClientError('Database not found', 404, 'DATABASE_NOT_FOUND', { id: ctx.params.id });
				const server = await ctx.call('v1.mysql.servers.resolve', { id: database.server });
				if (!server)
					throw new MoleculerClientError('Server not found', 404, 'SERVER_NOT_FOUND', { id: database.server });
				return this.execQuery(server, `SELECT COUNT(*) FROM information_schema.processlist WHERE DB = '${database.name}';`);
			}
		},
	},

	/**
	 * Events
	 */
	events: {
		// create database on server
		async "mysql.databases.created"(ctx) {
			const database = ctx.params.data;

			const server = await ctx.call('v1.mysql.servers.resolve', {
				id: database.server
			});

			await this.createMYSQLDatabase(server, database.name);

			this.logger.info(`Database ${database.name} created on server ${server.hostname}`)
		},
		// drop database on server
		async "mysql.databases.removed"(ctx) {
			const database = ctx.params.data;

			const server = await ctx.call('v1.mysql.servers.resolve', {
				id: database.server
			});

			await this.dropMYSQLDatabase(server, database.name);

			this.logger.info(`Database ${database.name} dropped on server ${server.hostname}`)
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