"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const Membership = require('membership-mixin')
const { MoleculerClientError } = require("moleculer").Errors;
const MYSQLMixin = require('../mixins/mysql.mixins');
const generator = require('generate-password');

/**
 * attachments of addons service
 */
module.exports = {
	name: "mysql.provisions",
	version: 1,

	mixins: [
		DbService({
			permissions: 'mysql.provisions'
		}),
		ConfigLoader(['mysql.**']),
		Membership({
			permissions: 'mysql.provisions'
		})
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
			user: {
				type: "string",
				required: true,
				empty: false,
				populate: {
					action: "v1.mysql.users.resolve",
				},
			},

			...DbService.FIELDS,// inject dbservice fields
			...Membership.FIELDS,// inject membership fields
		},

		// default database populates
		defaultPopulates: [],

		// database scopes
		scopes: {
			...DbService.SCOPE,// inject dbservice scope
			...Membership.SCOPE,// inject membership scope
		},

		// default database scope
		defaultScopes: [
			...DbService.DSCOPE,// inject dbservice dscope
			...Membership.DSCOPE,// inject membership dscope
		],

		// default init config settings
		config: {

		}
	},

	/**
	 * Actions
	 */

	actions: {

		//provision a database and user for a server and create a provision entry
		provision: {
			rest: "POST /provision",
			permissions: ['mysql.provisions.provision'],
			params: {
				zone: { type: "string", optional: true },
				prefix: { type: "string", default: 'provision', optional: true },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await this.searchAvailableServer(ctx, params);

				//create provisioned database and user
				const database = await ctx.call('v1.mysql.databases.create', {
					server: server.id,
					name: this.generatePrefixName(params),
				});
				this.logger.info(`Database created ${database.id}`);

				// create user
				const user = await ctx.call('v1.mysql.users.create', {
					server: server.id,
					databases: [database.id],
					username: this.generatePrefixName(params),
					password: generator.generate({
						length: 10,
						numbers: true
					}),
				});
				this.logger.info(`User created ${user.id}`);

				//create provision entry
				const provision = await this.createEntity(ctx, {
					server: server.id,
					database: database.id,
					user: user.id,
				});
				this.logger.info(`Provision created ${provision.id}`);
				//grant user to database. 
				//wait for user and database to be created 
				//TODO: add timeout or watch for user and database to be created
				await ctx.call('v1.mysql.users.grant', {
					database: database.id,
					id: user.id,
				});
				this.logger.info(`User granted ${user.id} to ${database.id} for provision ${provision.id}`);

				return provision;
			}
		},

		pack: {
			rest:{
				method: "GET",
				path: "/:id/pack",
			},
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['mtsql.provisions.pack'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const { server, database, user } = await ctx.call('v1.mysql.provisions.get', {
					id: params.id,
					populate: ['server', 'database', 'user']
				});

				return {
					MYSQL_USERNAME: user.username,
					MYSQL_PASSWORD: user.password,
					MYSQL_DATABASE: database.name,
					MYSQL_HOST: server.hostname,
					MYSQL_PORT: `${server.port}`,
					MYSQL_URI: `mysql://${user.username}:${user.password}@${server.hostname}:${server.port}/${database.name}`
				};
			}
		},
		//deprovision a database and user for a server and remove a provision entry
		deprovision: {
			rest: "DELETE /:id/deprovision",
			permissions: ['mysql.provisions.deprovision'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				this.logger.info(`Deprovisioning ${params.id}`);

				const provision = await this.findEntity(null, {
					query: {
						id: params.id
					}
				});

				if (!provision)
					throw new MoleculerClientError('Provision not found', 404, 'PROVISION_NOT_FOUND');


				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: provision.server
				});

				if (!server)
					throw new MoleculerClientError('Server not found', 404, 'SERVER_NOT_FOUND');


				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: provision.database
				});

				if (!database)
					throw new MoleculerClientError('Database not found', 404, 'DATABASE_NOT_FOUND');


				const user = await ctx.call('v1.mysql.users.resolve', {
					id: provision.user
				});

				if (!user)
					throw new MoleculerClientError('User not found', 404, 'USER_NOT_FOUND');


				//revoke user from database
				await ctx.call('v1.mysql.users.revoke', {
					database: database.id,
					id: user.id,
				});

				//remove database
				const databaseID = await ctx.call('v1.mysql.databases.remove', {
					id: database.id
				});
				this.logger.info(`Database removed ${databaseID}`);

				//remove user
				const userID = await ctx.call('v1.mysql.users.remove', {
					id: user.id
				});
				this.logger.info(`User removed ${userID}`);


				//remove provision entry
				return this.removeEntity(ctx, {
					id: provision.id
				}).then((id) => {
					this.logger.info(`Provision removed ${id}`);
					return id;
				});
			}
		},
	},

	/**
	 * Events
	 */
	events: {

	},

	/**
	 * Methods
	 */
	methods: {
		generatePrefixName(params) {
			const code = generator.generate({
				length: 4,
				numbers: true
			})
			return `${params.prefix}_${code}`;
		},
		async searchAvailableServer(ctx, { zone }) {
			//search for available server in zone
			const zoneServers = await ctx.call('v1.mysql.servers.find', { query: { zone } });
			if (zoneServers.length > 0) {
				return zoneServers[0];
			}
			//search for available server in all zones
			const servers = await ctx.call('v1.mysql.servers.find', {});
			console.log(servers)
			if (servers.length > 0) {
				return servers[0];
			}
			throw new MoleculerClientError('No available server found', 404, 'NO_AVAILABLE_SERVER_FOUND');
		},
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