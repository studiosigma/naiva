import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileService } from './file.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Files (Knowledge Vault)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document to vault storage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File successfully uploaded.' })
  async upload(
    @GetUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please provide a file to upload.');
    }
    return this.fileService.uploadFile(
      userId,
      file.originalname,
      file.buffer,
      file.mimetype,
      file.size,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all vault files of the authenticated user' })
  async findAll(@GetUser('id') userId: string) {
    return this.fileService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve file record details' })
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.fileService.findOne(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file from vault and S3 compatible storage' })
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.fileService.remove(userId, id);
  }
}
