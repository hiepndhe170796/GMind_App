using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GMind.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectDiscussionAndFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AvatarFileId",
                table: "Users",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    ReplyToMessageId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeletedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectMessages_ProjectMessages_ReplyToMessageId",
                        column: x => x.ReplyToMessageId,
                        principalTable: "ProjectMessages",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ProjectMessages_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectMessages_Users_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectMessages_Users_DeletedByUserId",
                        column: x => x.DeletedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ProjectMessageMentions",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMessageMentions", x => new { x.MessageId, x.UserId });
                    table.ForeignKey(
                        name: "FK_ProjectMessageMentions_ProjectMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "ProjectMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectMessageMentions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StoredFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MessageId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UploadedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Extension = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoredFiles", x => x.Id);
                    table.CheckConstraint("CK_StoredFiles_Scope", "([Kind] = 4 AND [GroupId] IS NULL AND [ProjectId] IS NULL) OR ([Kind] <> 4 AND [GroupId] IS NOT NULL AND [ProjectId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_StoredFiles_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StoredFiles_ProjectMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "ProjectMessages",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StoredFiles_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StoredFiles_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StoredFiles_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_AvatarFileId",
                table: "Users",
                column: "AvatarFileId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMessageMentions_UserId",
                table: "ProjectMessageMentions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMessages_AuthorUserId",
                table: "ProjectMessages",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMessages_DeletedByUserId",
                table: "ProjectMessages",
                column: "DeletedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMessages_ProjectId_CreatedAt_Id",
                table: "ProjectMessages",
                columns: new[] { "ProjectId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMessages_ReplyToMessageId",
                table: "ProjectMessages",
                column: "ReplyToMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_GroupId_DeletedAt",
                table: "StoredFiles",
                columns: new[] { "GroupId", "DeletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_MessageId",
                table: "StoredFiles",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_ProjectId_Kind",
                table: "StoredFiles",
                columns: new[] { "ProjectId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_StorageKey",
                table: "StoredFiles",
                column: "StorageKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_TaskId",
                table: "StoredFiles",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_UploadedByUserId",
                table: "StoredFiles",
                column: "UploadedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Users_StoredFiles_AvatarFileId",
                table: "Users",
                column: "AvatarFileId",
                principalTable: "StoredFiles",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_StoredFiles_AvatarFileId",
                table: "Users");

            migrationBuilder.DropTable(
                name: "ProjectMessageMentions");

            migrationBuilder.DropTable(
                name: "StoredFiles");

            migrationBuilder.DropTable(
                name: "ProjectMessages");

            migrationBuilder.DropIndex(
                name: "IX_Users_AvatarFileId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AvatarFileId",
                table: "Users");
        }
    }
}
