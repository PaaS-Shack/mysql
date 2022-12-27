"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const mysql = require('mysql2');
/**
 * attachments of addons service
 */
module.exports = {
	name: "mysql.databases",
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
			server: {
				type: "string",
				required: true,
				empty: false,
				populate: {
					action: "v1.mysql.servers.resolve",
					params: {
						//fields: ["id", "online", "hostname", 'nodeID'],
						//populate: ['network']
					}
				}
			},

			name: {
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
		getDatabase: {
			params: {
				server: { type: "string", min: 3, optional: false },
				name: { type: "string", min: 3, optional: false },
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


		async "mysql.databases.created"(ctx) {
			const database = ctx.params.data;

			const server = await ctx.call('v1.mysql.servers.resolve', {
				id: database.server
			})
			console.log(database, server)

			var connection = mysql.createConnection({
				host: server.hostname,
				port: server.port,
				user: 'root',
				password: server.password
			});

			connection.connect();

			return new Promise((resolve, reject) => {

				connection.query(`CREATE DATABASE ${database.name};`, function (error, results, fields) {
					console.log(error, results, fields)
					if (error) reject(error);
					else resolve(database);
				});
				connection.end();
			})
		},

		async "mysql.databases.removed"(ctx) {
			const database = ctx.params.data;

			const server = await ctx.call('v1.mysql.servers.resolve', {
				id: database.server
			})
			console.log(database, server)

			var connection = mysql.createConnection({
				host: server.hostname,
				port: server.port,
				user: 'root',
				password: server.password
			});

			connection.connect();

			return new Promise((resolve, reject) => {

				connection.query(`DROP DATABASE ${database.name}`, function (error, results, fields) {
					if (error) return reject(error);
					resolve(results)
				});

				connection.end();
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