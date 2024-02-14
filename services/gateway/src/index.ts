import Fastify, {FastifyReply, FastifyRequest } from 'fastify'
import mercurius, { IResolvers } from 'mercurius'
import codegen, { gql } from 'mercurius-codegen'
import amqp from 'amqplib'
import {v4 as uuid} from 'uuid'

if (undefined === process.env.AMQP_URI) {
  throw Error('This service requires configuration: message queue URI.')
}

const amqpUri = process.env.AMQP_URI

const buildContext = async (req: FastifyRequest, _reply: FastifyReply) => {
    return {
      authorization: req.headers.authorization
    }
  }

type PromiseType<T> = T extends PromiseLike<infer U> ? U : T

declare module 'mercurius' {
  interface MercuriusContext extends PromiseType<ReturnType<typeof buildContext>> {}
}

const schema = gql`
    type Query {
        tournament(title: String!): String!
    }
`

const resolvers: IResolvers = {
    Query: {
        tournament: async (_, {title}) => {
          const queue = "tournament"
          const connection = await amqp.connect(amqpUri)
          const channel = await connection.createChannel()
          const correlationId = uuid()

          const tournamentRequest = new Promise(async (resolve) => {
            const { queue: replyTo } = await channel.assertQueue("", { exclusive: true })

            console.debug(replyTo)
            await channel.consume(replyTo, (msg) => {
              if (msg?.properties.correlationId === correlationId) {
                resolve(msg.content.toString())
              }
            }, {noAck: true})

            await channel.assertQueue(queue, {durable: false})

            channel.sendToQueue(queue, Buffer.from(title), {correlationId, replyTo})
          })

          const res = await tournamentRequest

          return res
        }
    }
}

const app = Fastify()

app.register(mercurius, { schema, resolvers, context: buildContext, graphiql: true })

app.listen({ port: 80, host: '0.0.0.0' })

codegen(app, {
    targetPath: './graphql/generated.ts'
} )