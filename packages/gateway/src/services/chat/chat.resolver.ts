import { Arg, Field, ID, InputType, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { ChatMessage } from '../../entities/chat/message.entity';
import { ChatThread } from '../../entities/chat/thread.entity';

@ObjectType()
class ThreadDTO {
  @Field(() => ID)
  id!: string;
  @Field(() => [ChatMessage])
  messages!: ChatMessage[];
}

@InputType()
class PostQuestionInput {
  @Field({ nullable: true })
  threadId?: string;
  @Field()
  content!: string;
}

@Service()
@Resolver()
export class ChatResolver {
  private threadRepo = dataSource.getRepository(ChatThread);
  private messageRepo = dataSource.getRepository(ChatMessage);

  @Query(() => ThreadDTO, { nullable: true })
  async thread(@Arg('id') id: string): Promise<ThreadDTO | null> {
    const thread = await this.threadRepo.findOne({ where: { id }, relations: { messages: true } });
    if (!thread) return null;
    return { id: thread.id, messages: thread.messages };
  }

  @Mutation(() => ThreadDTO)
  async postQuestion(@Arg('input') input: PostQuestionInput): Promise<ThreadDTO> {
    let thread: ChatThread | null = null;
    if (input.threadId) {
      thread = await this.threadRepo.findOne({ where: { id: input.threadId }, relations: { messages: true } });
    }
    if (!thread) {
      thread = this.threadRepo.create();
      await this.threadRepo.save(thread);
      thread.messages = [];
    }
    const userMessage = this.messageRepo.create({ thread, role: 'user', content: input.content });
    await this.messageRepo.save(userMessage);
    // Stub assistant echo (placeholder retrieval/LLM integration)
    const assistantMessage = this.messageRepo.create({
      thread,
      role: 'assistant',
      content: `Echo: ${input.content}`,
      citations: []
    });
    await this.messageRepo.save(assistantMessage);
    const latest = await this.threadRepo.findOne({ where: { id: thread.id }, relations: { messages: true } });
    return { id: thread.id, messages: latest?.messages || [] };
  }
}
